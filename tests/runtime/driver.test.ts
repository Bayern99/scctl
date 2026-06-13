import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { ScDriver, SclangControllerLike } from '../../src/runtime/driver.js';

class FakeController implements SclangControllerLike {
  public logs = '';
  public processAlive = true;
  public busy = false;
  public unexpectedExitError: Error | null = null;
  public readonly runScript = vi.fn<
    (script: string, options: { completionMarkers: string[]; timeoutMs?: number }) => Promise<{
      matchedMarker: string;
      rawOutput: string;
    }>
  >();
  public readonly boot = vi.fn(async () => {});
  public readonly stop = vi.fn(async () => {
    this.processAlive = false;
  });

  clearUnexpectedExitError(): void {
    this.unexpectedExitError = null;
  }

  getLogs(): string {
    return this.logs;
  }

  getLogsTail(tail: number): string {
    return tail >= this.logs.length ? this.logs : this.logs.slice(-tail);
  }

  getUnexpectedExitError(): Error | null {
    return this.unexpectedExitError;
  }

  hasProcess(): boolean {
    return this.processAlive;
  }

  isBusy(): boolean {
    return this.busy;
  }
}

function writeTestWav(
  outPath: string,
  options: {
    amplitude?: number;
    channelCount?: number;
    durationSec: number;
    sampleRate?: number;
  },
): void {
  const sampleRate = options.sampleRate ?? 48000;
  const channelCount = options.channelCount ?? 2;
  const frameCount = Math.max(1, Math.round(sampleRate * options.durationSec));
  const amplitude = options.amplitude ?? 0.1;
  const blockAlign = channelCount * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const header = Buffer.alloc(44);
  const data = Buffer.alloc(dataSize);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 32767 * amplitude,
    );
    for (let channel = 0; channel < channelCount; channel += 1) {
      data.writeInt16LE(sample, (frame * channelCount + channel) * 2);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, data]));
}

describe('ScDriver', () => {
  it('creates a ready session for successful eval', async () => {
    const controller = new FakeController();
    controller.runScript
      .mockResolvedValueOnce({ matchedMarker: '__BOOT__', rawOutput: 'boot ok' })
      .mockResolvedValueOnce({ matchedMarker: '__EVAL__', rawOutput: '2' });

    const driver = new ScDriver({
      createController: () => controller,
      discoverPath: () => '/mock/sclang',
    });

    const result = await driver.eval('1 + 1');

    expect(result.success).toBe(true);
    expect(result.state).toBe('ready');
    expect(result.phase).toBe('eval');
    expect(result.raw_output).toContain('boot ok');
    expect(result.raw_output).toContain('2');
    expect(result.session).toMatchObject({
      state: 'ready',
      phase: 'eval',
      session_id: expect.any(String),
    });
  });

  it('marks SuperCollider errors as sc_runtime_error', async () => {
    const controller = new FakeController();
    controller.runScript
      .mockResolvedValueOnce({ matchedMarker: '__BOOT__', rawOutput: 'boot ok' })
      .mockResolvedValueOnce({
        matchedMarker: '__EVAL__',
        rawOutput: 'ERROR: Class not defined.\nAFTER',
      });

    const driver = new ScDriver({
      createController: () => controller,
      discoverPath: () => '/mock/sclang',
    });

    const result = await driver.eval('NoSuchClass.foo');

    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('sc_runtime_error');
    expect(result.state).toBe('ready');
    expect(result.recoverable).toBe(true);
  });

  it('returns a structured session_conflict when the controller is busy', async () => {
    const controller = new FakeController();
    controller.busy = true;

    const driver = new ScDriver({
      createController: () => controller,
      discoverPath: () => '/mock/sclang',
    });

    // Prime the session so the busy controller is reused.
    (driver as any).controller = controller;
    (driver as any).sessionId = 'scctl-test';

    const result = await driver.eval('1 + 1');

    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('session_conflict');
    expect(result.state).toBe('busy');
  });

  it('returns render artifacts and stops the session after render', async () => {
    const outPath = path.join(os.tmpdir(), `scctl-driver-render-${Date.now()}.wav`);
    writeTestWav(outPath, { durationSec: 0.1 });
    const controller = new FakeController();
    controller.runScript
      .mockResolvedValueOnce({ matchedMarker: '__BOOT__', rawOutput: 'boot ok' })
      .mockResolvedValueOnce({ matchedMarker: '__START__', rawOutput: 'recording' })
      .mockResolvedValueOnce({ matchedMarker: '__STOP__', rawOutput: 'stopped' });

    const driver = new ScDriver({
      createController: () => controller,
      discoverPath: () => '/mock/sclang',
      sleep: async () => {},
    });

    const result = await driver.render({
      durationSec: 0.1,
      outPath,
      userCode: '{ SinOsc.ar(440, 0, 0.1) }.play;',
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('stopped');
    expect(result.artifact).toMatchObject({
      path: outPath,
      duration_sec: 0.1,
      render_mode: 'draft',
      engine_used: 'scsynth',
      sample_rate: 48000,
      sample_format: 'int16',
      channel_count: 2,
      frame_count: 4800,
      verification: {
        exists: true,
        non_empty: true,
        output_error_detected: false,
        stop_completed: true,
        failure_reasons: [],
      },
    });
    expect(result.artifact?.bytes).toBeGreaterThan(44);
    expect(controller.stop).toHaveBeenCalled();
  });

  it('marks renders without a valid artifact as render_failed with verification details', async () => {
    const outPath = '/tmp/scctl-driver-empty.wav';
    const controller = new FakeController();
    controller.runScript
      .mockResolvedValueOnce({ matchedMarker: '__BOOT__', rawOutput: 'boot ok' })
      .mockResolvedValueOnce({ matchedMarker: '__START__', rawOutput: 'recording' })
      .mockResolvedValueOnce({ matchedMarker: '__STOP__', rawOutput: 'stopped' });

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const driver = new ScDriver({
      createController: () => controller,
      discoverPath: () => '/mock/sclang',
      sleep: async () => {},
    });

    const result = await driver.render({
      durationSec: 0.1,
      outPath,
      userCode: '{ SinOsc.ar(440, 0, 0.1) }.play;',
    });

    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('render_failed');
    expect(result.artifact?.verification).toMatchObject({
      exists: false,
      non_empty: false,
      output_error_detected: false,
      stop_completed: true,
    });
    expect(result.artifact?.verification?.failure_reasons).toContain(
      'Output WAV file was not created.',
    );

    existsSpy.mockRestore();
  });

  it('renders NRT artifacts through the one-shot runtime path', async () => {
    const sourcePath = path.join(os.tmpdir(), `scctl-driver-nrt-${Date.now()}.scd`);
    const outPath = path.join(os.tmpdir(), `scctl-driver-nrt-${Date.now()}.wav`);
    fs.writeFileSync(sourcePath, '// nrt test source\n', 'utf8');
    writeTestWav(outPath, { durationSec: 0.5 });

    const driver = new ScDriver({
      discoverPath: () => '/mock/sclang',
      detectCapabilities: () => ({
        sclang: { available: true, path: '/mock/sclang' },
        scsynth: { available: true, path: '/mock/scsynth' },
        supernova: { available: false, path: null },
        extensions_paths: [],
        quarks_paths: [],
        sc3_plugins: {
          detected: false,
          plugin_count: 0,
          plugin_paths: [],
        },
        nrt_available: true,
      }),
      runNrtRender: vi.fn(async () => ({
        success: true,
        raw_output: 'nrt ok',
        exit_code: 0,
      })),
    });

    const result = await driver.renderNrt({
      sourcePath,
      outPath,
      sampleFormat: 'float',
    });

    expect(result.success).toBe(true);
    expect(result.phase).toBe('render_nrt');
    expect(result.artifact).toMatchObject({
      path: outPath,
      render_mode: 'nrt',
      engine_used: 'scsynth',
      sample_rate: 48000,
      channel_count: 2,
    });
  });

  it('fails explicitly when supernova is requested but unavailable', async () => {
    const sourcePath = path.join(os.tmpdir(), `scctl-driver-supernova-${Date.now()}.scd`);
    fs.writeFileSync(sourcePath, '// nrt supernova test source\n', 'utf8');

    const driver = new ScDriver({
      discoverPath: () => '/mock/sclang',
      detectCapabilities: () => ({
        sclang: { available: true, path: '/mock/sclang' },
        scsynth: { available: true, path: '/mock/scsynth' },
        supernova: { available: false, path: null },
        extensions_paths: [],
        quarks_paths: [],
        sc3_plugins: {
          detected: false,
          plugin_count: 0,
          plugin_paths: [],
        },
        nrt_available: true,
      }),
    });

    const result = await driver.renderNrt({
      sourcePath,
      outPath: path.join(os.tmpdir(), `scctl-driver-supernova-${Date.now()}.wav`),
      enginePreference: 'supernova',
    });

    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('capability_unavailable');
  });

  it('reclaims a degraded session by booting a fresh controller', async () => {
    const staleController = new FakeController();
    staleController.unexpectedExitError = new Error('bad exit');

    const freshController = new FakeController();
    freshController.runScript.mockResolvedValueOnce({
      matchedMarker: '__BOOT__',
      rawOutput: 'fresh boot',
    });

    const createController = vi.fn().mockReturnValue(freshController);

    const driver = new ScDriver({
      createController: createController as any,
      discoverPath: () => '/mock/sclang',
    });

    (driver as any).controller = staleController;
    (driver as any).sessionId = 'stale-session';
    (driver as any).state = 'degraded';

    const result = await driver.reclaim();

    expect(result.success).toBe(true);
    expect(result.state).toBe('ready');
    expect(result.summary).toContain('reclaimed');
    expect(staleController.stop).toHaveBeenCalled();
  });
});
