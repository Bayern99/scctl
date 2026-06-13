import fs from 'fs';
import path from 'path';
import { detectRuntimeCapabilities } from './capabilities.js';
import { discoverSclangPath } from './discover.js';
import {
  EngineKind,
  EnginePreference,
  DriverErrorKind,
  DriverResult,
  DriverState,
  HealthSnapshot,
  RequestedSampleFormat,
  RenderArtifact,
  RuntimeCapabilities,
  SessionSnapshot,
} from './driver-types.js';
import {
  buildEvalScript,
  buildPingScript,
  buildRenderStartScript,
  buildRenderStopScript,
  buildResetScript,
  buildServerRunningScript,
  buildWaitForBootScript,
  containsScRuntimeError,
  makeMarker,
} from './protocol.js';
import { runNrtRender } from './render-nrt.js';
import { buildRenderArtifact, isRenderArtifactValid } from './render-artifact.js';
import {
  RunScriptOptions,
  ScriptRunResult,
  SclangController,
  SclangControllerOptions,
} from './sclang.js';

export interface SclangControllerLike {
  boot(): Promise<void>;
  clearUnexpectedExitError(): void;
  getLogs(): string;
  getLogsTail(tail: number): string;
  getUnexpectedExitError(): Error | null;
  hasProcess(): boolean;
  isBusy(): boolean;
  runScript(script: string, options: RunScriptOptions): Promise<ScriptRunResult>;
  stop(): Promise<void>;
}

export interface DriverOptions {
  createController?: (
    sclangPath: string,
    options?: SclangControllerOptions,
  ) => SclangControllerLike;
  detectCapabilities?: (
    sclangPath: string | null,
  ) => RuntimeCapabilities;
  discoverPath?: () => string | null;
  executeTimeoutMs?: number;
  runNrtRender?: typeof runNrtRender;
  sleep?: (ms: number) => Promise<void>;
}

interface ReadyControllerResult {
  controller: SclangControllerLike;
  rawOutput: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSessionId(): string {
  return `scctl-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

export class ScDriver {
  private controller: SclangControllerLike | null = null;
  private readonly createController;
  private readonly discoverPath;
  private readonly executeTimeoutMs: number;
  private readonly detectCapabilities;
  private readonly runNrt;
  private readonly sleepMs;
  private state: DriverState = 'idle';
  private phase = 'idle';
  private sessionId: string | null = null;
  private lastErrorKind: DriverErrorKind | null = null;

  constructor(options: DriverOptions = {}) {
    this.createController =
      options.createController ??
      ((sclangPath: string, controllerOptions?: SclangControllerOptions) =>
        new SclangController(sclangPath, controllerOptions));
    this.detectCapabilities = options.detectCapabilities ?? detectRuntimeCapabilities;
    this.discoverPath = options.discoverPath ?? (() => discoverSclangPath());
    this.executeTimeoutMs = options.executeTimeoutMs ?? 120_000;
    this.runNrt = options.runNrtRender ?? runNrtRender;
    this.sleepMs = options.sleep ?? sleep;
  }

  public async check(): Promise<DriverResult> {
    const sclangPath = this.discoverPath();
    const capabilities = this.getCapabilities(sclangPath);
    if (!sclangPath) {
      return this.buildErrorResult('check', 'engine_missing', 'engine_missing', false, '', {
        capabilities,
        summary: 'SuperCollider engine is not installed or not discoverable.',
      });
    }

    if (this.controller) {
      return this.buildSuccessResult('check', this.state, '', {
        capabilities,
        summary: 'Engine is available and an active session is present.',
        session: this.snapshot(sclangPath),
      });
    }

    const probeController = this.createController(sclangPath, {
      executeTimeoutMs: this.executeTimeoutMs,
    });

    try {
      await probeController.boot();
      const doneMarker = makeMarker('check_ping');
      const probe = await probeController.runScript(buildPingScript(doneMarker), {
        completionMarkers: [doneMarker],
        timeoutMs: this.executeTimeoutMs,
      });

      return this.buildSuccessResult('check', this.state, probe.rawOutput, {
        capabilities,
        summary: 'SuperCollider engine is reachable.',
        session: this.snapshot(sclangPath),
      });
    } catch (err: any) {
      return this.buildErrorResult('check', 'degraded', 'protocol_error', true, '', {
        capabilities,
        summary: `Engine was found but interpreter ping failed: ${err.message}`,
      });
    } finally {
      await probeController.stop();
    }
  }

  public async status(): Promise<DriverResult> {
    const sclangPath = this.discoverPath();
    const degradedReason = this.getDegradedReason();
    if (degradedReason) {
      this.state = 'degraded';
      return this.buildErrorResult('status', 'degraded', 'process_exit', true, '', {
        summary: degradedReason,
        session: this.snapshot(sclangPath),
      });
    }

    return this.buildSuccessResult('status', this.state, '', {
      summary: this.controller
        ? 'An active driver session is present.'
        : 'No active driver session is present.',
      session: this.snapshot(sclangPath),
    });
  }

  public async health(): Promise<DriverResult> {
    const sclangPath = this.discoverPath();
    const capabilities = this.getCapabilities(sclangPath);
    if (!sclangPath) {
      return this.buildErrorResult('health', 'engine_missing', 'engine_missing', false, '', {
        capabilities,
        summary: 'SuperCollider engine is not installed or not discoverable.',
        health: this.buildHealthSnapshot(null, false, false, 'Engine path not found'),
      });
    }

    if (!this.controller) {
      return this.buildSuccessResult('health', this.state, '', {
        capabilities,
        summary: 'Engine is available and there is no active session.',
        health: this.buildHealthSnapshot(sclangPath, false, false, null),
      });
    }

    const degradedReason = this.getDegradedReason();
    if (degradedReason) {
      this.state = 'degraded';
      return this.buildErrorResult('health', 'degraded', 'process_exit', true, '', {
        capabilities,
        summary: degradedReason,
        health: this.buildHealthSnapshot(sclangPath, false, false, degradedReason),
      });
    }

    if (this.controller.isBusy()) {
      this.state = 'busy';
      return this.buildSuccessResult('health', 'busy', '', {
        capabilities,
        summary: 'Session is busy; returning the last known health snapshot.',
        health: this.buildHealthSnapshot(sclangPath, this.controller.hasProcess(), true, null),
      });
    }

    const readyMarker = makeMarker('health_ready');
    const notReadyMarker = makeMarker('health_not_ready');

    try {
      const probe = await this.controller.runScript(
        buildServerRunningScript(readyMarker, notReadyMarker),
        {
          completionMarkers: [readyMarker, notReadyMarker],
          timeoutMs: this.executeTimeoutMs,
        },
      );

      if (probe.matchedMarker === readyMarker) {
        this.state = 'ready';
        this.phase = 'health';
        return this.buildSuccessResult('health', 'ready', probe.rawOutput, {
          capabilities,
          summary: 'Session is healthy and ready.',
          health: this.buildHealthSnapshot(sclangPath, true, true, null),
        });
      }

      this.state = 'degraded';
      this.lastErrorKind = 'server_not_ready';
      return this.buildErrorResult(
        'health',
        'degraded',
        'server_not_ready',
        true,
        probe.rawOutput,
        {
          capabilities,
          summary: 'The active session is alive but the SuperCollider server is not ready.',
          health: this.buildHealthSnapshot(
            sclangPath,
            true,
            false,
            'Server reported not ready',
          ),
        },
      );
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'protocol_error';
      return this.buildErrorResult('health', 'degraded', 'protocol_error', true, '', {
        capabilities,
        summary: `Health probe failed: ${err.message}`,
        health: this.buildHealthSnapshot(
          sclangPath,
          this.controller.hasProcess(),
          false,
          err.message,
        ),
      });
    }
  }

  public async eval(code: string): Promise<DriverResult> {
    if (!code.trim()) {
      return this.buildErrorResult('eval', this.state, 'invalid_argument', false, '', {
        summary: 'Evaluation code must not be empty.',
      });
    }

    const ready = await this.ensureReadyController('eval');
    if ('success' in ready) {
      return ready;
    }

    this.state = 'busy';
    this.phase = 'eval';

    const doneMarker = makeMarker('eval_done');
    try {
      const result = await ready.controller.runScript(buildEvalScript(code, doneMarker), {
        completionMarkers: [doneMarker],
        timeoutMs: this.executeTimeoutMs,
      });

      return this.buildEvalLikeResult('eval', ready.rawOutput, result.rawOutput);
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'protocol_error';
      return this.buildErrorResult('eval', 'degraded', 'protocol_error', true, ready.rawOutput, {
        summary: `Evaluation protocol failed: ${err.message}`,
      });
    }
  }

  public async runFile(filePath: string, readFile: (path: string) => string): Promise<DriverResult> {
    if (!filePath.trim()) {
      return this.buildErrorResult('run_file', this.state, 'invalid_argument', false, '', {
        summary: 'A .scd file path is required.',
      });
    }

    let userCode: string;
    try {
      userCode = readFile(filePath);
    } catch (err: any) {
      return this.buildErrorResult('run_file', this.state, 'invalid_argument', false, '', {
        summary: err.message,
      });
    }

    const ready = await this.ensureReadyController('run_file');
    if ('success' in ready) {
      return ready;
    }

    this.state = 'busy';
    this.phase = 'run_file';

    const doneMarker = makeMarker('run_file_done');
    try {
      const result = await ready.controller.runScript(buildEvalScript(userCode, doneMarker), {
        completionMarkers: [doneMarker],
        timeoutMs: this.executeTimeoutMs,
      });

      return this.buildEvalLikeResult('run_file', ready.rawOutput, result.rawOutput);
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'protocol_error';
      return this.buildErrorResult(
        'run_file',
        'degraded',
        'protocol_error',
        true,
        ready.rawOutput,
        {
          summary: `File execution protocol failed: ${err.message}`,
        },
      );
    }
  }

  public async logs(tail?: number): Promise<DriverResult> {
    if (!this.controller) {
      return this.buildErrorResult('logs', this.state, 'session_missing', true, '', {
        summary: 'No active session is available for log inspection.',
      });
    }

    const output =
      typeof tail === 'number' && tail > 0
        ? this.controller.getLogsTail(tail)
        : this.controller.getLogs();

    return this.buildSuccessResult('logs', this.state, output, {
      summary: 'Returning the requested log buffer slice.',
      session: this.snapshot(this.discoverPath()),
    });
  }

  public async render(options: {
    durationSec?: number;
    outPath: string;
    userCode: string;
  }): Promise<DriverResult<RenderArtifact>> {
    const durationSec = options.durationSec ?? 5;
    if (!options.outPath.trim()) {
      return this.buildErrorResult('render', this.state, 'invalid_argument', false, '', {
        summary: 'A writable output WAV path is required.',
      });
    }
    if (!options.userCode.trim()) {
      return this.buildErrorResult('render', this.state, 'invalid_argument', false, '', {
        summary: 'Render code must not be empty.',
      });
    }
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return this.buildErrorResult('render', this.state, 'invalid_argument', false, '', {
        summary: 'Render duration must be a positive number.',
      });
    }

    const ready = await this.ensureReadyController('render');
    if ('success' in ready) {
      return ready;
    }

    this.state = 'busy';
    this.phase = 'render';

    const startMarker = makeMarker('render_start');
    const stopMarker = makeMarker('render_stop');
    let output = ready.rawOutput;
    let stopCompleted = false;

    try {
      const start = await ready.controller.runScript(
        buildRenderStartScript(
          {
            durationSec,
            outPath: options.outPath,
            userCode: options.userCode,
          },
          startMarker,
        ),
        {
          completionMarkers: [startMarker],
          timeoutMs: this.executeTimeoutMs,
        },
      );

      output = this.mergeOutput(output, start.rawOutput);
      if (containsScRuntimeError(output)) {
        const artifact = buildRenderArtifact(
          options.outPath,
          durationSec,
          output,
          false,
          'draft',
          'scsynth',
        );
        await this.stopAndClearController(true);
        return this.buildErrorResult(
          'render',
          'stopped',
          'sc_runtime_error',
          true,
          output,
          {
            summary: 'Render setup failed because SuperCollider reported an error.',
            artifact,
          },
        );
      }

      await this.sleepMs(durationSec * 1_000);

      const stop = await ready.controller.runScript(buildRenderStopScript(stopMarker), {
        completionMarkers: [stopMarker],
        timeoutMs: this.executeTimeoutMs,
      });
      stopCompleted = true;
      output = this.mergeOutput(output, stop.rawOutput);
      const artifact = buildRenderArtifact(
        options.outPath,
        durationSec,
        output,
        true,
        'draft',
        'scsynth',
      );

      await this.stopAndClearController(true);

      if (!isRenderArtifactValid(artifact)) {
        return this.buildErrorResult('render', 'stopped', 'render_failed', true, output, {
          summary: 'Render finished without producing a valid non-empty WAV artifact.',
          artifact,
        });
      }

      return this.buildSuccessResult('render', 'stopped', output, {
        summary: 'Render completed and produced a draft WAV artifact.',
        artifact,
      });
    } catch (err: any) {
      const artifact = buildRenderArtifact(
        options.outPath,
        durationSec,
        output,
        stopCompleted,
        'draft',
        'scsynth',
      );
      await this.stopAndClearController(true);
      return this.buildErrorResult('render', 'stopped', 'render_failed', true, output, {
        summary: `Render flow failed: ${err.message}`,
        artifact,
      });
    }
  }

  public async renderNrt(options: {
    durationSec?: number;
    enginePreference?: EnginePreference;
    outPath: string;
    sampleFormat?: RequestedSampleFormat;
    sourcePath: string;
  }): Promise<DriverResult<RenderArtifact>> {
    const sourcePath = options.sourcePath.trim();
    const outPath = options.outPath.trim();
    const enginePreference = options.enginePreference ?? 'auto';
    const sampleFormat = options.sampleFormat ?? 'float';
    const sclangPath = this.discoverPath();
    const capabilities = this.getCapabilities(sclangPath);

    if (!sclangPath) {
      this.state = 'engine_missing';
      return this.buildErrorResult('render_nrt', 'engine_missing', 'engine_missing', false, '', {
        capabilities,
        summary: 'SuperCollider engine is not installed or not discoverable.',
      });
    }
    if (!sourcePath) {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: 'An absolute .scd source path is required for NRT rendering.',
      });
    }
    if (!path.isAbsolute(sourcePath)) {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: 'NRT rendering requires an absolute .scd source path.',
      });
    }
    if (!sourcePath.toLowerCase().endsWith('.scd')) {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: 'NRT rendering only accepts .scd source files.',
      });
    }
    if (!outPath) {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: 'An absolute output WAV path is required for NRT rendering.',
      });
    }
    if (!path.isAbsolute(outPath)) {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: 'NRT rendering requires an absolute output WAV path.',
      });
    }
    try {
      const stat = fs.statSync(sourcePath);
      if (!stat.isFile()) {
        return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
          capabilities,
          summary: `Path is not a regular file: ${sourcePath}`,
        });
      }
    } catch {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: `File not found: ${sourcePath}`,
      });
    }
    if (!['float', 'double'].includes(sampleFormat)) {
      return this.buildErrorResult('render_nrt', this.state, 'invalid_argument', false, '', {
        capabilities,
        summary: 'NRT sample_format must be float or double.',
      });
    }

    const engine = this.resolveNrtEngine(enginePreference, capabilities);
    if (!engine) {
      return this.buildErrorResult(
        'render_nrt',
        this.state,
        'capability_unavailable',
        false,
        '',
        {
          capabilities,
          summary:
            enginePreference === 'supernova'
              ? 'supernova was explicitly requested but is not available on this machine.'
              : 'NRT rendering is unavailable because the required SuperCollider engine binaries were not found.',
        },
      );
    }

    const result = await this.runNrt({
      durationSec: options.durationSec,
      enginePath: engine.path,
      engineUsed: engine.kind,
      executeTimeoutMs: this.executeTimeoutMs,
      outPath,
      sampleFormat,
      sclangPath,
      sourcePath,
    });

    const artifact = buildRenderArtifact(
      outPath,
      options.durationSec ?? 0,
      result.raw_output,
      result.success,
      'nrt',
      engine.kind,
    );

    if (!result.success) {
      const errorKind = containsScRuntimeError(result.raw_output)
        ? 'sc_runtime_error'
        : 'render_failed';
      return this.buildErrorResult('render_nrt', this.state, errorKind, true, result.raw_output, {
        artifact,
        capabilities,
        summary:
          errorKind === 'sc_runtime_error'
            ? 'NRT rendering failed because SuperCollider reported a runtime error.'
            : 'NRT rendering did not complete successfully.',
      });
    }

    if (!isRenderArtifactValid(artifact)) {
      return this.buildErrorResult('render_nrt', this.state, 'render_failed', true, result.raw_output, {
        artifact,
        capabilities,
        summary: 'NRT rendering finished without producing a valid WAV artifact.',
      });
    }

    return this.buildSuccessResult('render_nrt', this.state, result.raw_output, {
      artifact,
      capabilities,
      summary: 'NRT render completed and produced a final-quality WAV artifact.',
    });
  }

  public async stop(): Promise<DriverResult> {
    if (!this.controller) {
      this.state = 'stopped';
      this.phase = 'stop';
      return this.buildSuccessResult('stop', 'stopped', '', {
        summary: 'No active session was running.',
      });
    }

    this.state = 'stopping';
    this.phase = 'stop';

    try {
      await this.stopAndClearController(false);
      return this.buildSuccessResult('stop', 'stopped', '', {
        summary: 'The active session was stopped cleanly.',
      });
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'cleanup_failed';
      return this.buildErrorResult('stop', 'degraded', 'cleanup_failed', true, '', {
        summary: `Stopping the active session failed: ${err.message}`,
      });
    }
  }

  public async reset(): Promise<DriverResult> {
    if (!this.controller) {
      return this.buildSuccessResult('reset', this.state, '', {
        summary: 'No active session was present, so there was nothing to reset.',
      });
    }
    if (this.controller.isBusy()) {
      return this.buildErrorResult('reset', 'busy', 'session_conflict', true, '', {
        summary: 'The active session is busy and cannot be reset right now.',
      });
    }

    const ready = await this.ensureReadyController('reset');
    if ('success' in ready) {
      return ready;
    }

    const doneMarker = makeMarker('reset_done');
    this.state = 'busy';
    this.phase = 'reset';

    try {
      const result = await ready.controller.runScript(buildResetScript(doneMarker), {
        completionMarkers: [doneMarker],
        timeoutMs: this.executeTimeoutMs,
      });
      const output = this.mergeOutput(ready.rawOutput, result.rawOutput);
      if (containsScRuntimeError(output)) {
        this.state = 'degraded';
        this.lastErrorKind = 'cleanup_failed';
        return this.buildErrorResult('reset', 'degraded', 'cleanup_failed', true, output, {
          summary: 'Reset finished with SuperCollider-side cleanup errors.',
        });
      }

      this.state = 'ready';
      this.lastErrorKind = null;
      return this.buildSuccessResult('reset', 'ready', output, {
        summary: 'The active session was cleaned and is ready for more work.',
      });
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'cleanup_failed';
      return this.buildErrorResult('reset', 'degraded', 'cleanup_failed', true, ready.rawOutput, {
        summary: `Reset failed: ${err.message}`,
      });
    }
  }

  public async reboot(): Promise<DriverResult> {
    if (this.controller?.isBusy()) {
      return this.buildErrorResult('reboot', 'busy', 'session_conflict', true, '', {
        summary: 'The active session is busy and cannot be rebooted right now.',
      });
    }

    try {
      await this.stopAndClearController(false);
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'cleanup_failed';
      return this.buildErrorResult('reboot', 'degraded', 'cleanup_failed', true, '', {
        summary: `Graceful reboot cleanup failed: ${err.message}`,
      });
    }

    const ready = await this.ensureReadyController('reboot');
    if ('success' in ready) {
      return ready;
    }

    this.state = 'ready';
    this.lastErrorKind = null;
    return this.buildSuccessResult('reboot', 'ready', ready.rawOutput, {
      summary: 'A fresh session was created and the SuperCollider server is ready.',
    });
  }

  public async reclaim(): Promise<DriverResult> {
    await this.stopAndClearController(true);

    const ready = await this.ensureReadyController('reclaim');
    if ('success' in ready) {
      return ready;
    }

    this.state = 'ready';
    this.lastErrorKind = null;
    return this.buildSuccessResult('reclaim', 'ready', ready.rawOutput, {
      summary: 'The local driver session was reclaimed and reinitialized.',
    });
  }

  private async ensureReadyController(
    phase: string,
  ): Promise<DriverResult | ReadyControllerResult> {
    const sclangPath = this.discoverPath();
    if (!sclangPath) {
      this.state = 'engine_missing';
      this.lastErrorKind = 'engine_missing';
      return this.buildErrorResult(phase, 'engine_missing', 'engine_missing', false, '', {
        summary: 'SuperCollider engine is not installed or not discoverable.',
      });
    }

    const degradedReason = this.getDegradedReason();
    if (degradedReason) {
      this.state = 'degraded';
      this.lastErrorKind = 'process_exit';
      return this.buildErrorResult(phase, 'degraded', 'process_exit', true, '', {
        summary: degradedReason,
      });
    }

    if (this.controller?.isBusy()) {
      this.state = 'busy';
      return this.buildErrorResult(phase, 'busy', 'session_conflict', true, '', {
        summary: 'The active session is already executing another action.',
      });
    }

    if (!this.controller) {
      this.controller = this.createController(sclangPath, {
        executeTimeoutMs: this.executeTimeoutMs,
      });
      this.sessionId = createSessionId();
    }

    this.state = 'booting';
    this.phase = phase;

    try {
      await this.controller.boot();
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'protocol_error';
      return this.buildErrorResult(phase, 'degraded', 'protocol_error', true, '', {
        summary: `Failed to boot the sclang interpreter: ${err.message}`,
      });
    }

    const doneMarker = makeMarker(`${phase}_boot_ready`);
    try {
      const bootReady = await this.controller.runScript(buildWaitForBootScript(doneMarker), {
        completionMarkers: [doneMarker],
        timeoutMs: this.executeTimeoutMs,
      });
      this.state = 'ready';
      this.lastErrorKind = null;
      this.controller.clearUnexpectedExitError();
      return {
        controller: this.controller,
        rawOutput: bootReady.rawOutput,
      };
    } catch (err: any) {
      this.state = 'degraded';
      this.lastErrorKind = 'boot_timeout';
      return this.buildErrorResult(phase, 'degraded', 'boot_timeout', true, '', {
        summary: `SuperCollider server did not become ready in time: ${err.message}`,
      });
    }
  }

  private buildEvalLikeResult(
    phase: string,
    bootOutput: string,
    commandOutput: string,
  ): DriverResult {
    const rawOutput = this.mergeOutput(bootOutput, commandOutput);

    if (containsScRuntimeError(rawOutput)) {
      this.state = 'ready';
      this.lastErrorKind = 'sc_runtime_error';
      return this.buildErrorResult(phase, 'ready', 'sc_runtime_error', true, rawOutput, {
        summary: 'SuperCollider reported a runtime error while executing the command.',
      });
    }

    this.state = 'ready';
    this.lastErrorKind = null;
    return this.buildSuccessResult(phase, 'ready', rawOutput, {
      summary: 'SuperCollider executed the command successfully.',
    });
  }

  private buildSuccessResult<TArtifact>(
    phase: string,
    state: DriverState,
      rawOutput: string,
      extras: {
        artifact?: TArtifact;
        capabilities?: RuntimeCapabilities;
        health?: HealthSnapshot;
        session?: SessionSnapshot;
        summary: string;
      },
  ): DriverResult<TArtifact> {
    this.phase = phase;
    return {
      success: true,
      state,
      phase,
      session_id: this.sessionId,
      recoverable: state !== 'engine_missing',
      error_kind: null,
      summary: extras.summary,
      raw_output: rawOutput,
      artifact: extras.artifact,
      capabilities: extras.capabilities,
      health: extras.health,
      session: extras.session ?? this.snapshot(this.discoverPath()),
    };
  }

  private buildErrorResult<TArtifact>(
    phase: string,
    state: DriverState,
    errorKind: DriverErrorKind,
    recoverable: boolean,
      rawOutput: string,
      extras: {
        artifact?: TArtifact;
        capabilities?: RuntimeCapabilities;
        health?: HealthSnapshot;
        session?: SessionSnapshot;
        summary: string;
      },
  ): DriverResult<TArtifact> {
    this.phase = phase;
    this.lastErrorKind = errorKind;
    return {
      success: false,
      state,
      phase,
      session_id: this.sessionId,
      recoverable,
      error_kind: errorKind,
      summary: extras.summary,
      raw_output: rawOutput,
      artifact: extras.artifact,
      capabilities: extras.capabilities,
      health: extras.health,
      session: extras.session ?? this.snapshot(this.discoverPath()),
    };
  }

  private buildHealthSnapshot(
    enginePath: string | null,
    processAlive: boolean,
    serverReady: boolean,
    degradedReason: string | null,
  ): HealthSnapshot {
    return {
      ...this.snapshot(enginePath),
      process_alive: processAlive,
      server_ready: serverReady,
      log_bytes: this.controller?.getLogs().length ?? 0,
      degraded_reason: degradedReason,
    };
  }

  private snapshot(enginePath: string | null): SessionSnapshot {
    return {
      state: this.state,
      phase: this.phase,
      session_id: this.sessionId,
      engine_path: enginePath,
      has_controller: this.controller !== null,
      busy: this.controller?.isBusy() ?? false,
      last_error_kind: this.lastErrorKind,
      recoverable: this.state !== 'engine_missing',
    };
  }

  private getDegradedReason(): string | null {
    const exitError = this.controller?.getUnexpectedExitError();
    if (!exitError) {
      return null;
    }
    return `The active session exited unexpectedly: ${exitError.message}`;
  }

  private mergeOutput(...chunks: string[]): string {
    return chunks.filter(Boolean).join('\n').trim();
  }

  private getCapabilities(sclangPath: string | null): RuntimeCapabilities {
    return this.detectCapabilities(sclangPath);
  }

  private resolveNrtEngine(
    preference: EnginePreference,
    capabilities: RuntimeCapabilities,
  ): { kind: EngineKind; path: string } | null {
    if (preference === 'supernova') {
      return capabilities.supernova.available && capabilities.supernova.path
        ? { kind: 'supernova', path: capabilities.supernova.path }
        : null;
    }

    if (capabilities.scsynth.available && capabilities.scsynth.path) {
      return { kind: 'scsynth', path: capabilities.scsynth.path };
    }

    return null;
  }

  private async stopAndClearController(ignoreErrors: boolean): Promise<void> {
    if (!this.controller) {
      this.state = 'stopped';
      this.sessionId = null;
      return;
    }

    const controller = this.controller;
    this.controller = null;
    this.sessionId = null;

    try {
      await controller.stop();
      this.state = 'stopped';
      this.lastErrorKind = null;
    } catch (err) {
      this.state = 'degraded';
      this.lastErrorKind = 'cleanup_failed';
      if (!ignoreErrors) {
        throw err;
      }
    }
  }
}
