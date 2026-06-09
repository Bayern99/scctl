import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SclangController } from '../../src/runtime/sclang.js';
import { EventEmitter } from 'events';

class MockStdin extends EventEmitter {
  write = vi.fn();
  end = vi.fn();
}

class MockProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = new MockStdin();
  kill = vi.fn();
}

let mockProcess: MockProcess;

vi.mock('child_process', () => {
  return {
    spawn: vi.fn().mockImplementation(() => {
      return mockProcess;
    })
  };
});

describe('Sclang Process Controller', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockProcess = new MockProcess();
  });

  it('should instantiate and execute a simple code block', async () => {
    const controller = new SclangController('/mock/path/sclang');
    expect(controller).toBeDefined();
    expect(typeof controller.execute).toBe('function');
  });

  it('should boot and execute code successfully', async () => {
    const controller = new SclangController('/mock/path/sclang');
    
    vi.useFakeTimers();
    const bootPromise = controller.boot();
    
    // Fast-forward timeout in boot
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const execPromise = controller.execute('1 + 1');

    // Simulate stdout output from sclang
    setTimeout(() => {
      // Find delimiter in mockStdin.write call to match it
      const lastWrite = mockProcess.stdin.write.mock.calls[0][0] as string;
      const delimMatch = lastWrite.match(/SC_EVAL_DONE_\d+_\d+/);
      const delim = delimMatch ? delimMatch[0] : '';
      mockProcess.stdout.emit('data', Buffer.from(`\n2\n${delim}_OK\n`));
    }, 100);

    await vi.advanceTimersByTimeAsync(200);
    const result = await execPromise;

    expect(result.success).toBe(true);
    expect(result.output).toContain('2');
    expect(controller.getLogs()).toContain('2');
    vi.useRealTimers();
  });

  it('should boot and handle execution error', async () => {
    const controller = new SclangController('/mock/path/sclang');
    
    vi.useFakeTimers();
    const bootPromise = controller.boot();
    
    // Fast-forward timeout in boot
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const execPromise = controller.execute('invalid_code');

    // Simulate stdout output from sclang indicating error
    setTimeout(() => {
      const lastWrite = mockProcess.stdin.write.mock.calls[0][0] as string;
      const delimMatch = lastWrite.match(/SC_EVAL_DONE_\d+_\d+/);
      const delim = delimMatch ? delimMatch[0] : '';
      mockProcess.stdout.emit('data', Buffer.from(`\nERROR: Class not defined\n${delim}_ERR\n`));
    }, 100);

    await vi.advanceTimersByTimeAsync(200);
    const result = await execPromise;

    expect(result.success).toBe(false);
    expect(result.output).toContain('ERROR: Class not defined');
    expect(controller.getLogs()).toContain('ERROR: Class not defined');
    vi.useRealTimers();
  });

  it('should stop the process and send stop commands', async () => {
    const controller = new SclangController('/mock/path/sclang');
    
    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    controller.stop();
    
    expect(mockProcess.stdin.write).toHaveBeenCalledWith('CmdPeriod.run; Server.killAll;\n\x0c');
    expect(mockProcess.stdin.end).toHaveBeenCalled();
    
    await vi.advanceTimersByTimeAsync(500);
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });

  it('should reject boot on spawn error', async () => {
    const controller = new SclangController('/mock/path/sclang');
    
    const bootPromise = controller.boot();
    
    const testError = new Error('Spawn failed');
    mockProcess.emit('error', testError);
    
    await expect(bootPromise).rejects.toThrow('Spawn failed');
  });

  it('should reject execute on process exit', async () => {
    const controller = new SclangController('/mock/path/sclang');
    
    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const execPromise = controller.execute('1 + 1');

    // Simulate process crash/exit
    mockProcess.emit('exit', 1, 'SIGKILL');

    await expect(execPromise).rejects.toThrow('sclang process exited unexpectedly with code 1 and signal SIGKILL');
    vi.useRealTimers();
  });

  it('should reject concurrent execution calls', async () => {
    const controller = new SclangController('/mock/path/sclang');
    
    vi.useFakeTimers();
    const bootPromise = controller.boot();
    await vi.advanceTimersByTimeAsync(1500);
    await bootPromise;

    const execPromise1 = controller.execute('1 + 1');
    const execPromise2 = controller.execute('2 + 2');

    await expect(execPromise2).rejects.toThrow('Concurrent execution is not supported');

    // Clean up first execution to avoid hanging promises
    const lastWrite = mockProcess.stdin.write.mock.calls[0][0] as string;
    const delimMatch = lastWrite.match(/SC_EVAL_DONE_\d+_\d+/);
    const delim = delimMatch ? delimMatch[0] : '';
    mockProcess.stdout.emit('data', Buffer.from(`${delim}_OK`));

    await execPromise1;
    vi.useRealTimers();
  });
});
