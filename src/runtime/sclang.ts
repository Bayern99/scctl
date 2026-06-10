import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export interface SclangControllerOptions {
  executeTimeoutMs?: number;
  maxLogBytes?: number;
  stopTimeoutMs?: number;
}

export interface RunScriptOptions {
  completionMarkers: string[];
  timeoutMs?: number;
}

export interface ScriptRunResult {
  matchedMarker: string;
  rawOutput: string;
}

interface PendingRun {
  buffer: string;
  completionMarkers: string[];
  reject: (err: Error) => void;
  resolve: (result: ScriptRunResult) => void;
  timeout: NodeJS.Timeout;
}

const DEFAULT_BOOT_READY_MS = 1_500;
const DEFAULT_EXECUTE_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LOG_BYTES = 512_000;
const DEFAULT_STOP_TIMEOUT_MS = 1_000;

export class SclangController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private readonly path: string;
  private outputBuffer = '';
  private bootPromise: Promise<void> | null = null;
  private bootReject: ((err: Error) => void) | null = null;
  private bootResolve: (() => void) | null = null;
  private bootTimeout: NodeJS.Timeout | null = null;
  private pendingRun: PendingRun | null = null;
  private readonly executeTimeoutMs: number;
  private readonly maxLogBytes: number;
  private readonly stopTimeoutMs: number;
  private stopInProgress = false;
  private unexpectedExitError: Error | null = null;

  constructor(sclangPath: string, options: SclangControllerOptions = {}) {
    this.path = sclangPath;
    this.executeTimeoutMs = options.executeTimeoutMs ?? DEFAULT_EXECUTE_TIMEOUT_MS;
    this.maxLogBytes = options.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES;
    this.stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
  }

  public boot(): Promise<void> {
    if (this.bootPromise) {
      return this.bootPromise;
    }
    if (this.process) {
      return Promise.resolve();
    }

    this.unexpectedExitError = null;
    this.bootPromise = new Promise((resolve, reject) => {
      this.bootResolve = resolve;
      this.bootReject = reject;

      try {
        const cp = spawn(this.path, ['-i', 'scide']);
        this.process = cp;

        cp.stdin.on('error', () => {});

        cp.stdout.on('data', (data) => {
          this.handleOutput(data.toString());
        });
        cp.stderr.on('data', (data) => {
          this.handleOutput(data.toString());
        });

        cp.on('error', (err) => {
          this.rejectBoot(err);
          this.rejectPendingRun(err);
          this.cleanupProcess();
        });

        cp.on('exit', (code, signal) => {
          const exitErr = new Error(
            `sclang process exited unexpectedly with code ${code} and signal ${signal}`,
          );

          if (!this.stopInProgress) {
            this.unexpectedExitError = exitErr;
          }

          this.rejectBoot(exitErr);
          this.rejectPendingRun(exitErr);
          this.cleanupProcess();
        });

        this.bootTimeout = setTimeout(() => {
          this.bootTimeout = null;
          if (this.bootResolve) {
            this.bootResolve();
          }
          this.bootResolve = null;
          this.bootReject = null;
          this.bootPromise = null;
        }, DEFAULT_BOOT_READY_MS);
      } catch (err: any) {
        this.bootPromise = null;
        this.bootResolve = null;
        this.bootReject = null;
        reject(err);
      }
    });

    return this.bootPromise;
  }

  public async runScript(
    script: string,
    options: RunScriptOptions,
  ): Promise<ScriptRunResult> {
    if (!this.process) {
      throw new Error('sclang is not booted. Call boot() first.');
    }
    if (this.pendingRun) {
      throw new Error('Concurrent execution is not supported');
    }
    if (options.completionMarkers.length === 0) {
      throw new Error('At least one completion marker is required');
    }

    const timeoutMs = options.timeoutMs ?? this.executeTimeoutMs;

    return new Promise<ScriptRunResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRun = null;
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRun = {
        buffer: '',
        completionMarkers: [...options.completionMarkers],
        reject,
        resolve,
        timeout,
      };

      try {
        const normalizedScript = script.endsWith('\n') ? script : `${script}\n`;
        this.process?.stdin.write(`${normalizedScript}\x0c`);
      } catch (err: any) {
        clearTimeout(timeout);
        this.pendingRun = null;
        reject(err);
      }
    });
  }

  public getLogs(): string {
    return this.outputBuffer;
  }

  public getLogsTail(tail: number): string {
    if (tail <= 0 || this.outputBuffer.length <= tail) {
      return this.outputBuffer;
    }
    return this.outputBuffer.slice(-tail);
  }

  public hasProcess(): boolean {
    return this.process !== null;
  }

  public isBusy(): boolean {
    return this.pendingRun !== null;
  }

  public getUnexpectedExitError(): Error | null {
    return this.unexpectedExitError;
  }

  public clearUnexpectedExitError(): void {
    this.unexpectedExitError = null;
  }

  public stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      const cp = this.process;
      if (!cp) {
        this.cleanupProcess();
        resolve();
        return;
      }

      this.stopInProgress = true;
      this.rejectPendingRun(new Error('Controller stopped'));

      const finish = () => {
        cleanup();
        this.cleanupProcess();
        resolve();
      };

      const cleanup = () => {
        cp.removeListener('exit', finish);
        cp.removeListener('close', finish);
        clearTimeout(killTimeout);
      };

      cp.on('exit', finish);
      cp.on('close', finish);

      const killTimeout = setTimeout(() => {
        try {
          cp.kill('SIGKILL');
        } catch {
          // Ignore best-effort kill failures.
        }
        finish();
      }, this.stopTimeoutMs);

      try {
        cp.stdin.write('CmdPeriod.run; Server.killAll;\n\x0c');
        cp.stdin.end();
      } catch {
        try {
          cp.kill('SIGKILL');
        } catch {
          // Ignore best-effort kill failures.
        }
        finish();
      }
    });
  }

  private handleOutput(chunk: string): void {
    this.outputBuffer += chunk;
    if (this.outputBuffer.length > this.maxLogBytes) {
      this.outputBuffer = this.outputBuffer.slice(-this.maxLogBytes);
    }

    if (!this.pendingRun) {
      return;
    }

    this.pendingRun.buffer += chunk;
    const matchedMarker = this.pendingRun.completionMarkers.find((marker) =>
      this.pendingRun?.buffer.includes(marker),
    );

    if (!matchedMarker) {
      return;
    }

    const pending = this.pendingRun;
    this.pendingRun = null;
    clearTimeout(pending.timeout);

    const cleanedOutput = pending.completionMarkers.reduce((output, marker) => {
      return output.split(marker).join('');
    }, pending.buffer).trim();

    pending.resolve({
      matchedMarker,
      rawOutput: cleanedOutput,
    });
  }

  private rejectBoot(err: Error): void {
    if (this.bootTimeout) {
      clearTimeout(this.bootTimeout);
      this.bootTimeout = null;
    }
    if (this.bootReject) {
      this.bootReject(err);
    }
    this.bootReject = null;
    this.bootResolve = null;
    this.bootPromise = null;
  }

  private rejectPendingRun(err: Error): void {
    if (!this.pendingRun) {
      return;
    }

    clearTimeout(this.pendingRun.timeout);
    const pending = this.pendingRun;
    this.pendingRun = null;
    pending.reject(err);
  }

  private cleanupProcess(): void {
    if (this.bootTimeout) {
      clearTimeout(this.bootTimeout);
      this.bootTimeout = null;
    }
    this.bootPromise = null;
    this.bootResolve = null;
    this.bootReject = null;
    this.process = null;
    this.stopInProgress = false;
  }
}
