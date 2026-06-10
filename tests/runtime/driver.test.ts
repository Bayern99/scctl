import fs from 'fs';
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
    const outPath = '/tmp/scctl-driver-render.wav';
    const controller = new FakeController();
    controller.runScript
      .mockResolvedValueOnce({ matchedMarker: '__BOOT__', rawOutput: 'boot ok' })
      .mockResolvedValueOnce({ matchedMarker: '__START__', rawOutput: 'recording' })
      .mockResolvedValueOnce({ matchedMarker: '__STOP__', rawOutput: 'stopped' });

    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const statSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 128 } as fs.Stats);

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
    expect(result.artifact).toEqual({
      path: outPath,
      bytes: 128,
      duration_sec: 0.1,
    });
    expect(controller.stop).toHaveBeenCalled();

    existsSpy.mockRestore();
    statSpy.mockRestore();
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
