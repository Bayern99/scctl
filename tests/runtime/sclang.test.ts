import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SclangController } from '../../src/runtime/sclang.js';

class MockStdin extends EventEmitter {
  end = vi.fn();
  write = vi.fn();
}

class MockProcess extends EventEmitter {
  stderr = new EventEmitter();
  stdin = new MockStdin();
  stdout = new EventEmitter();
  kill = vi.fn();
}

let mockProcess: MockProcess;

vi.mock('child_process', () => {
  return {
    spawn: vi.fn().mockImplementation(() => mockProcess),
  };
});

describe('SclangController', () => {
  beforeEach(() => {
    mockProcess = new MockProcess();
    vi.mocked(spawn).mockClear();
  });

  it('boots and runs a script until a completion marker appears', async () => {
    const controller = new SclangController('/mock/path/sclang');

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const marker = '__DONE__';
    const runPromise = controller.runScript('"hello".postln;', {
      completionMarkers: [marker],
    });

    setTimeout(() => {
      mockProcess.stdout.emit('data', Buffer.from(`hello\n${marker}\n`));
    }, 100);

    await vi.advanceTimersByTimeAsync(200);
    const result = await runPromise;

    expect(result.matchedMarker).toBe(marker);
    expect(result.rawOutput).toContain('hello');
    expect(result.rawOutput).not.toContain(marker);
    expect(controller.getLogs()).toContain('hello');
    vi.useRealTimers();
  });

  it('supports multiple completion markers', async () => {
    const controller = new SclangController('/mock/path/sclang');

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const okMarker = '__OK__';
    const errMarker = '__ERR__';
    const runPromise = controller.runScript('"oops".postln;', {
      completionMarkers: [okMarker, errMarker],
    });

    setTimeout(() => {
      mockProcess.stderr.emit('data', Buffer.from(`oops\n${errMarker}\n`));
    }, 100);

    await vi.advanceTimersByTimeAsync(200);
    const result = await runPromise;

    expect(result.matchedMarker).toBe(errMarker);
    expect(result.rawOutput).toContain('oops');
    vi.useRealTimers();
  });

  it('rejects concurrent script execution', async () => {
    const controller = new SclangController('/mock/path/sclang');

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const runPromise = controller.runScript('"one".postln;', {
      completionMarkers: ['__ONE__'],
    });

    await expect(
      controller.runScript('"two".postln;', {
        completionMarkers: ['__TWO__'],
      }),
    ).rejects.toThrow('Concurrent execution is not supported');

    mockProcess.stdout.emit('data', Buffer.from('__ONE__\n'));
    await runPromise;
    vi.useRealTimers();
  });

  it('rejects on execution timeout', async () => {
    const controller = new SclangController('/mock/path/sclang', {
      executeTimeoutMs: 1000,
    });

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const runPromise = controller.runScript('"slow".postln;', {
      completionMarkers: ['__DONE__'],
    });
    const rejection = expect(runPromise).rejects.toThrow(
      'Execution timed out after 1000ms',
    );

    await vi.advanceTimersByTimeAsync(1001);
    await rejection;
    vi.useRealTimers();
  });

  it('records an unexpected exit and rejects the pending run', async () => {
    const controller = new SclangController('/mock/path/sclang');

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const runPromise = controller.runScript('"one".postln;', {
      completionMarkers: ['__DONE__'],
    });

    mockProcess.emit('exit', 1, 'SIGKILL');

    await expect(runPromise).rejects.toThrow(
      'sclang process exited unexpectedly with code 1 and signal SIGKILL',
    );
    expect(controller.getUnexpectedExitError()).toBeInstanceOf(Error);
    vi.useRealTimers();
  });

  it('stops the process and rejects the pending run', async () => {
    const controller = new SclangController('/mock/path/sclang');

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const runPromise = controller.runScript('"one".postln;', {
      completionMarkers: ['__DONE__'],
    });
    const stopPromise = controller.stop();

    await expect(runPromise).rejects.toThrow('Controller stopped');
    expect(mockProcess.stdin.write).toHaveBeenCalledWith('CmdPeriod.run; Server.killAll;\n\x0c');
    expect(mockProcess.stdin.end).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await stopPromise;
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });

  it('caps the stored log buffer size', async () => {
    const controller = new SclangController('/mock/path/sclang', { maxLogBytes: 100 });

    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    mockProcess.stdout.emit('data', Buffer.from('x'.repeat(150)));
    expect(controller.getLogs().length).toBeLessThanOrEqual(100);
    vi.useRealTimers();
  });
});
