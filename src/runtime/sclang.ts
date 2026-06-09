import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export class SclangController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private path: string;
  private outputBuffer: string = '';
  private isExecuting: boolean = false;

  // Track active boot resolve/reject and timeout
  private bootResolve: (() => void) | null = null;
  private bootReject: ((err: Error) => void) | null = null;
  private bootTimeout: NodeJS.Timeout | null = null;

  // Track active execute reject
  private activeExecuteReject: ((err: Error) => void) | null = null;

  constructor(sclangPath: string) {
    this.path = sclangPath;
  }

  public boot(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.process) {
        resolve();
        return;
      }
      try {
        this.bootResolve = resolve;
        this.bootReject = reject;

        // -i scide launches sclang in interactive mode
        const cp = spawn(this.path, ['-i', 'scide']);
        this.process = cp;
        
        cp.stdin.on('error', () => {}); // swallow EPIPE/write errors

        cp.stdout.on('data', (data) => {
          this.outputBuffer += data.toString();
        });

        cp.stderr.on('data', (data) => {
          this.outputBuffer += data.toString();
        });

        cp.on('error', (err) => {
          if (this.bootReject) {
            this.bootReject(err);
            this.bootReject = null;
            this.bootResolve = null;
          }
          if (this.bootTimeout) {
            clearTimeout(this.bootTimeout);
            this.bootTimeout = null;
          }
          this.cleanupProcess();
        });

        cp.on('exit', (code, signal) => {
          const exitErr = new Error(`sclang process exited unexpectedly with code ${code} and signal ${signal}`);
          
          if (this.bootReject) {
            this.bootReject(exitErr);
            this.bootReject = null;
            this.bootResolve = null;
          }
          if (this.bootTimeout) {
            clearTimeout(this.bootTimeout);
            this.bootTimeout = null;
          }

          if (this.activeExecuteReject) {
            this.activeExecuteReject(exitErr);
            this.activeExecuteReject = null;
          }

          this.cleanupProcess();
        });

        // Wait brief moment for interpreter to boot
        this.bootTimeout = setTimeout(() => {
          this.bootTimeout = null;
          if (this.bootResolve) {
            this.bootResolve();
            this.bootResolve = null;
            this.bootReject = null;
          }
        }, 1500);
      } catch (err: any) {
        reject(err);
        this.bootResolve = null;
        this.bootReject = null;
      }
    });
  }

  public async execute(code: string): Promise<{ success: boolean; output: string }> {
    if (!this.process) {
      throw new Error('sclang is not booted. Call boot() first.');
    }

    if (this.isExecuting) {
      throw new Error('Concurrent execution is not supported');
    }

    this.isExecuting = true;

    const delim = 'SC_EVAL_DONE_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    const wrappedCode = `
try {
  {
    ${code}
  }.value;
  "\\n${delim}_OK".postln;
} { |error|
  "\\n${delim}_ERR".postln;
  error.reportError;
};
`;

    return new Promise<{ success: boolean; output: string }>((resolve, reject) => {
      this.activeExecuteReject = reject;
      let runBuffer = '';

      const dataHandler = (data: Buffer) => {
        const chunk = data.toString();
        runBuffer += chunk;
        this.outputBuffer += chunk;

        if (runBuffer.includes(`${delim}_OK`)) {
          cleanup();
          this.isExecuting = false;
          this.activeExecuteReject = null;
          resolve({
            success: true,
            output: runBuffer.replace(`${delim}_OK`, '').trim(),
          });
        } else if (runBuffer.includes(`${delim}_ERR`)) {
          cleanup();
          this.isExecuting = false;
          this.activeExecuteReject = null;
          resolve({
            success: false,
            output: runBuffer.replace(`${delim}_ERR`, '').trim(),
          });
        }
      };

      const cleanup = () => {
        this.process?.stdout.removeListener('data', dataHandler);
      };

      this.process!.stdout.on('data', dataHandler);
      try {
        this.process!.stdin.write(wrappedCode + '\x0c'); // Form feed character evaluates in sclang
      } catch (err: any) {
        cleanup();
        this.isExecuting = false;
        this.activeExecuteReject = null;
        reject(err);
      }
    });
  }

  public getLogs(): string {
    return this.outputBuffer;
  }

  public stop(): void {
    if (this.process) {
      // Send CmdPeriod to silence all audio
      try {
        this.process.stdin.write('CmdPeriod.run; Server.killAll;\n\x0c');
        this.process.stdin.end();
      } catch (err) {
        // Ignore write/end errors if process is already dead or closing
      }
      
      const cp = this.process;
      setTimeout(() => {
        try {
          cp.kill('SIGKILL');
        } catch (err) {
          // Ignore kill errors
        }
      }, 500);
      
      this.cleanupProcess();
    }
  }

  private cleanupProcess(): void {
    if (this.process) {
      this.process.removeAllListeners();
      this.process.stdout.removeAllListeners();
      this.process.stderr.removeAllListeners();
      this.process.stdin.removeAllListeners();
      this.process = null;
    }
    this.isExecuting = false;
  }
}
