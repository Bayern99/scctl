import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SclangController } from '../../src/runtime/sclang.js';
import { EventEmitter } from 'events';

// Create helper classes or variables for mock process
let mockStdout: EventEmitter;
let mockStderr: EventEmitter;
let mockStdin: { write: any };
let mockProcess: any;

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
    mockStdout = new EventEmitter();
    mockStderr = new EventEmitter();
    mockStdin = {
      write: vi.fn(),
    };
    mockProcess = {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: mockStdin,
      kill: vi.fn(),
    };
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
      const lastWrite = mockStdin.write.mock.calls[0][0] as string;
      const delimMatch = lastWrite.match(/SC_EVAL_DONE_\d+/);
      const delim = delimMatch ? delimMatch[0] : '';
      mockStdout.emit('data', Buffer.from(`\n2\n${delim}_OK\n`));
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
      const lastWrite = mockStdin.write.mock.calls[0][0] as string;
      const delimMatch = lastWrite.match(/SC_EVAL_DONE_\d+/);
      const delim = delimMatch ? delimMatch[0] : '';
      mockStdout.emit('data', Buffer.from(`\nERROR: Class not defined\n${delim}_ERR\n`));
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
    
    expect(mockStdin.write).toHaveBeenCalledWith('CmdPeriod.run; Server.killAll;\n\x0c');
    
    await vi.advanceTimersByTimeAsync(500);
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });
});
