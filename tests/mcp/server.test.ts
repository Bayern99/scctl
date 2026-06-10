import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  MockScDriver,
  mockReadScdFile,
} = vi.hoisted(() => {
  const mockReadScdFile = vi.fn();

  class MockScDriver {
    static instances: MockScDriver[] = [];

    check = vi.fn(async () => ({
      success: true,
      state: 'idle',
      phase: 'check',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'ok',
      raw_output: '',
    }));
    status = vi.fn(async () => ({
      success: true,
      state: 'idle',
      phase: 'status',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'idle',
      raw_output: '',
    }));
    health = vi.fn(async () => ({
      success: true,
      state: 'idle',
      phase: 'health',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'healthy',
      raw_output: '',
    }));
    eval = vi.fn(async (code: string) => ({
      success: code !== 'bad',
      state: 'ready',
      phase: 'eval',
      session_id: 'session-1',
      recoverable: true,
      error_kind: code === 'bad' ? 'sc_runtime_error' : null,
      summary: 'eval result',
      raw_output: code,
    }));
    runFile = vi.fn(async (path: string, readFile: (path: string) => string) => ({
      success: true,
      state: 'ready',
      phase: 'run_file',
      session_id: 'session-1',
      recoverable: true,
      error_kind: null,
      summary: 'run result',
      raw_output: readFile(path),
    }));
    logs = vi.fn(async (tail?: number) => ({
      success: true,
      state: 'ready',
      phase: 'logs',
      session_id: 'session-1',
      recoverable: true,
      error_kind: null,
      summary: 'logs',
      raw_output: typeof tail === 'number' ? `tail:${tail}` : 'logs',
    }));
    render = vi.fn(async ({ outPath, userCode }: { outPath: string; userCode: string }) => ({
      success: true,
      state: 'stopped',
      phase: 'render',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'rendered',
      raw_output: userCode,
      artifact: {
        path: outPath,
        bytes: 128,
        duration_sec: 2,
      },
    }));
    stop = vi.fn(async () => ({
      success: true,
      state: 'stopped',
      phase: 'stop',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'stopped',
      raw_output: '',
    }));
    reset = vi.fn(async () => ({
      success: true,
      state: 'ready',
      phase: 'reset',
      session_id: 'session-1',
      recoverable: true,
      error_kind: null,
      summary: 'reset',
      raw_output: '',
    }));
    reboot = vi.fn(async () => ({
      success: true,
      state: 'ready',
      phase: 'reboot',
      session_id: 'session-2',
      recoverable: true,
      error_kind: null,
      summary: 'reboot',
      raw_output: '',
    }));
    reclaim = vi.fn(async () => ({
      success: true,
      state: 'ready',
      phase: 'reclaim',
      session_id: 'session-3',
      recoverable: true,
      error_kind: null,
      summary: 'reclaim',
      raw_output: '',
    }));

    constructor() {
      MockScDriver.instances.push(this);
    }
  }

  return { MockScDriver, mockReadScdFile };
});

vi.mock('../../src/runtime/driver.js', () => ({
  ScDriver: MockScDriver,
}));

vi.mock('../../src/runtime/sc-file.js', () => ({
  readScdFile: mockReadScdFile,
}));

import { getActiveDriver, server, setActiveDriver } from '../../src/mcp/server.js';

describe('Pilot MCP server', () => {
  beforeEach(() => {
    mockReadScdFile.mockReset();
    MockScDriver.instances.length = 0;
    setActiveDriver(new MockScDriver() as any);
  });

  it('instantiates a server with tools capability', () => {
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(Server);
  });

  it('lists the expanded tool surface', async () => {
    const listToolsHandler = (server as any)._requestHandlers.get('tools/list');
    const result = await listToolsHandler(
      { method: 'tools/list' },
      { signal: new AbortController().signal },
    );

    expect(result.tools).toHaveLength(11);
    expect(result.tools.map((tool: any) => tool.name)).toEqual(
      expect.arrayContaining([
        'sc_check',
        'sc_status',
        'sc_health',
        'sc_eval',
        'sc_run_file',
        'sc_logs',
        'sc_render',
        'sc_stop',
        'sc_reset',
        'sc_reboot',
        'sc_reclaim',
      ]),
    );
  });

  it('delegates eval and reports errors via isError', async () => {
    const callToolHandler = (server as any)._requestHandlers.get('tools/call');
    const driver = getActiveDriver() as any;

    const ok = await callToolHandler(
      {
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: '1 + 1' } },
      },
      { signal: new AbortController().signal },
    );
    expect(driver.eval).toHaveBeenCalledWith('1 + 1');
    expect(ok.isError).toBe(false);

    const bad = await callToolHandler(
      {
        method: 'tools/call',
        params: { name: 'sc_eval', arguments: { code: 'bad' } },
      },
      { signal: new AbortController().signal },
    );
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain('"error_kind": "sc_runtime_error"');
  });

  it('reads a file for sc_run_file and sc_render path mode', async () => {
    mockReadScdFile.mockReturnValue('{ SinOsc.ar(440) }.play;');
    const callToolHandler = (server as any)._requestHandlers.get('tools/call');
    const driver = getActiveDriver() as any;

    await callToolHandler(
      {
        method: 'tools/call',
        params: { name: 'sc_run_file', arguments: { path: '/tmp/test.scd' } },
      },
      { signal: new AbortController().signal },
    );

    expect(mockReadScdFile).toHaveBeenCalledWith('/tmp/test.scd');
    expect(driver.runFile).toHaveBeenCalled();

    await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_render',
          arguments: { out: '/tmp/out.wav', path: '/tmp/test.scd', duration: 2 },
        },
      },
      { signal: new AbortController().signal },
    );

    expect(driver.render).toHaveBeenCalledWith({
      durationSec: 2,
      outPath: '/tmp/out.wav',
      userCode: '{ SinOsc.ar(440) }.play;',
    });
  });

  it('routes health, reset, reboot, reclaim, logs, and stop to the driver', async () => {
    const callToolHandler = (server as any)._requestHandlers.get('tools/call');
    const driver = getActiveDriver() as any;

    await callToolHandler(
      { method: 'tools/call', params: { name: 'sc_health' } },
      { signal: new AbortController().signal },
    );
    await callToolHandler(
      { method: 'tools/call', params: { name: 'sc_logs', arguments: { tail: 42 } } },
      { signal: new AbortController().signal },
    );
    await callToolHandler(
      { method: 'tools/call', params: { name: 'sc_reset' } },
      { signal: new AbortController().signal },
    );
    await callToolHandler(
      { method: 'tools/call', params: { name: 'sc_reboot' } },
      { signal: new AbortController().signal },
    );
    await callToolHandler(
      { method: 'tools/call', params: { name: 'sc_reclaim' } },
      { signal: new AbortController().signal },
    );
    await callToolHandler(
      { method: 'tools/call', params: { name: 'sc_stop' } },
      { signal: new AbortController().signal },
    );

    expect(driver.health).toHaveBeenCalled();
    expect(driver.logs).toHaveBeenCalledWith(42);
    expect(driver.reset).toHaveBeenCalled();
    expect(driver.reboot).toHaveBeenCalled();
    expect(driver.reclaim).toHaveBeenCalled();
    expect(driver.stop).toHaveBeenCalled();
  });
});
