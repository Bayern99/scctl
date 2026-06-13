import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_TRANSPORTS,
  WORKFLOW_TRANSPORTS,
  findWorkflowTransportByMcpName,
} from '../workflow/transport-contracts.js';

const {
  MockScDriver,
  mockReadScdFile,
  mockBuildMemorySummary,
  mockBuildArchiveMemorySummary,
} = vi.hoisted(() => {
  const mockReadScdFile = vi.fn();
  const mockBuildArchiveMemorySummary = vi.fn((_records: unknown, options: any = {}) => ({
    records_considered: options.limit ?? 0,
    recent_sessions: [],
    candidate_counts_by_status: {},
    review_rejection_reason_distribution: {},
    repeated_failures: [],
    preserved_item_patterns: [],
    probe_run_outcomes: { total: 0, success: 0, failure: 0 },
    probe_run_modes: {},
    render_mode_outcomes: {},
    nrt_failure_distribution: {},
    final_artifact_completion_ratio: 0,
    session_outcomes: {},
  }));
  const mockBuildMemorySummary = vi.fn(async (_archive: unknown, input: any = {}) => ({
    records_considered: input.limit ?? 0,
    recent_sessions: [],
    candidate_counts_by_status: {},
    review_rejection_reason_distribution: {},
    repeated_failures: [],
    preserved_item_patterns: [],
    probe_run_outcomes: { total: 0, success: 0, failure: 0 },
    probe_run_modes: {},
    render_mode_outcomes: {},
    nrt_failure_distribution: {},
    final_artifact_completion_ratio: 0,
    session_outcomes: {},
  }));

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
      session: {
        state: 'ready',
        phase: 'run_file',
        session_id: 'session-1',
        engine_path: '/mock/sclang',
        has_controller: true,
        busy: false,
        last_error_kind: null,
        recoverable: true,
      },
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
        verification: {
          exists: true,
          non_empty: true,
          output_error_detected: false,
          stop_completed: true,
          failure_reasons: [],
        },
      },
      session: {
        state: 'stopped',
        phase: 'render',
        session_id: null,
        engine_path: '/mock/sclang',
        has_controller: false,
        busy: false,
        last_error_kind: null,
        recoverable: true,
      },
    }));
    renderNrt = vi.fn(
      async ({
        outPath,
      }: {
        durationSec?: number;
        enginePreference?: 'auto' | 'scsynth' | 'supernova';
        outPath: string;
        sampleFormat?: 'float' | 'double';
        sourcePath: string;
      }) => ({
        success: true,
        state: 'stopped',
        phase: 'render_nrt',
        session_id: null,
        recoverable: true,
        error_kind: null,
        summary: 'rendered nrt',
        raw_output: 'nrt output',
        artifact: {
          path: outPath,
          bytes: 512,
          duration_sec: 2,
          render_mode: 'nrt' as const,
          engine_used: 'scsynth' as const,
          sample_rate: 48000,
          sample_format: 'float' as const,
          channel_count: 2,
          frame_count: 96000,
          verification: {
            exists: true,
            non_empty: true,
            output_error_detected: false,
            stop_completed: true,
            failure_reasons: [],
          },
        },
        session: {
          state: 'stopped',
          phase: 'render_nrt',
          session_id: null,
          engine_path: '/mock/sclang',
          has_controller: false,
          busy: false,
          last_error_kind: null,
          recoverable: true,
        },
      }),
    );
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

  return { MockScDriver, mockReadScdFile, mockBuildArchiveMemorySummary, mockBuildMemorySummary };
});

vi.mock('../../src/runtime/driver.js', () => ({
  ScDriver: MockScDriver,
}));

vi.mock('../../src/runtime/sc-file.js', () => ({
  readScdFile: mockReadScdFile,
}));

vi.mock('../../src/archive/memory-summary.js', () => ({
  buildMemorySummary: mockBuildMemorySummary,
  buildArchiveMemorySummary: mockBuildArchiveMemorySummary,
}));

import { getActiveDriver, server, setActiveDriver } from '../../src/mcp/server.js';

describe('Pilot MCP server', () => {
  beforeEach(() => {
    mockReadScdFile.mockReset();
    mockBuildMemorySummary.mockClear();
    mockBuildArchiveMemorySummary.mockClear();
    MockScDriver.instances.length = 0;
    process.env.SCCTL_ARCHIVE_ROOT = `/tmp/scctl-mcp-${Date.now()}-${Math.random()}`;
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

    const toolNames = result.tools.map((tool: any) => tool.name);

    expect(result.tools.map((tool: any) => tool.name)).toEqual(
      expect.arrayContaining([
        ...BASE_TRANSPORTS.mcp,
        ...WORKFLOW_TRANSPORTS.map((entry) => entry.mcp),
      ]),
    );
    expect(new Set(toolNames).size).toBe(toolNames.length);

    const runTool = result.tools.find((tool: any) => tool.name === 'sc_run_file');
    const renderTool = result.tools.find((tool: any) => tool.name === 'sc_render');
    const renderNrtTool = result.tools.find((tool: any) => tool.name === 'sc_render_nrt');

    expect(runTool.inputSchema.properties.task_tag).toBeDefined();
    expect(renderTool.inputSchema.properties.task_tag).toBeDefined();
    expect(renderNrtTool.inputSchema.properties.task_tag).toBeDefined();
  });

  it('exposes structured schemas for workflow MCP tools', async () => {
    const listToolsHandler = (server as any)._requestHandlers.get('tools/list');
    const result = await listToolsHandler(
      { method: 'tools/list' },
      { signal: new AbortController().signal },
    );

    for (const { mcp } of WORKFLOW_TRANSPORTS) {
      const tool = result.tools.find((entry: any) => entry.name === mcp);
      const contract = findWorkflowTransportByMcpName(mcp);

      expect(tool, `${mcp} should be listed`).toBeDefined();
      expect(tool.inputSchema?.type).toBe('object');
      expect(tool.inputSchema?.properties).toBeTruthy();
      expect(Object.keys(tool.inputSchema.properties)).not.toHaveLength(0);
      expect(contract?.resultKeys.length).toBeGreaterThan(0);
    }

    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_plan_workflow').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['spec', 'context']));
    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_run_probe').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['spec']));
    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_summarize_session').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['session_id', 'task', 'outcome', 'preserved_items', 'failures']));
    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_candidate_action').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['session_id', 'action', 'candidate_id']));
    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_memory_summary').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['session_id', 'candidate_id', 'limit']));
    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_prepare_handoff').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['task_id', 'task_tag', 'goal', 'requested_outcome', 'spec', 'constraints', 'memory_options', 'quality']));
    expect(
      Object.keys(
        result.tools.find((entry: any) => entry.name === 'sc_audit_session').inputSchema.properties,
      ),
    ).toEqual(expect.arrayContaining(['session_id', 'task_tag', 'candidate_id', 'quality']));
  });

  it('routes workflow MCP calls through structured JSON results', async () => {
    const callToolHandler = (server as any)._requestHandlers.get('tools/call');

    const plan = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_plan_workflow',
          arguments: { context: { task_label: 'sc-probe', requested_outcome: 'explore' } },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(plan.isError).toBe(false);
    expect(plan.content[0].text).toContain('"action": "plan_workflow"');
    expect(plan.content[0].text).toContain('"workflow": "probe"');

    const runProbe = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_run_probe',
          arguments: {
            spec: {
              id: 'probe-1',
              title: 'Bad probe',
              question: 'Missing eval code should fail.',
              mode: 'eval',
              tags: ['sc-probe'],
            },
          },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(runProbe.isError).toBe(true);
    expect(runProbe.content[0].text).toContain('"action": "run_probe"');

    const renderNrt = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_render_nrt',
          arguments: {
            path: '/tmp/final-nrt.scd',
            out: '/tmp/final-nrt.wav',
            engine_preference: 'auto',
          },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(renderNrt.isError).toBe(false);
    expect(renderNrt.content[0].text).toContain('"phase": "render_nrt"');
    expect(runProbe.content[0].text).toContain('"error_kind": "invalid_argument"');

    const summarize = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_summarize_session',
          arguments: {
            session_id: 'session-mcp-1',
            task: 'Primitive probe review',
            outcome: 'mixed',
            preserved_items: ['cand-1'],
            failures: ['noisy tail'],
            notes: ['rerun'],
          },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(summarize.isError).toBe(false);
    expect(summarize.content[0].text).toContain('"action": "summarize_session"');
    expect(summarize.content[0].text).toContain('"record_id"');

    const candidate = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_candidate_action',
          arguments: {
            session_id: 'session-mcp-1',
            action: 'create_draft',
            candidate_id: 'cand-1',
            name: 'metal-bloom',
            source_probe_id: 'probe-1',
          },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(candidate.isError).toBe(false);
    expect(candidate.content[0].text).toContain('"action": "candidate_action"');
    expect(candidate.content[0].text).toContain('"status": "draft"');

    const memory = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_memory_summary',
          arguments: { limit: 3 },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(memory.isError).toBe(false);
    expect(memory.content[0].text).toContain('"action": "memory_summary"');
    expect(memory.content[0].text).toContain('"records_considered": 3');
    expect(mockBuildArchiveMemorySummary).toHaveBeenCalled();

    const handoff = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_prepare_handoff',
          arguments: {
            task_id: 'task-mcp-handoff',
            task_tag: 'sc-probe',
            goal: 'Prepare a governed probe loop',
            requested_outcome: 'explore',
          },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(handoff.isError).toBe(false);
    expect(handoff.content[0].text).toContain('"action": "prepare_handoff"');
    expect(handoff.content[0].text).toContain('"sc_run_probe"');

    const missingAudit = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_audit_session',
          arguments: {
            session_id: 'missing-mcp-session',
            task_tag: 'sc-probe',
          },
        },
      },
      { signal: new AbortController().signal },
    );
    expect(missingAudit.isError).toBe(true);
    expect(missingAudit.content[0].text).toContain('"action": "audit_session"');
    expect(missingAudit.content[0].text).toContain('"recommended_next_step": "retry"');
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

    const runResponse = await callToolHandler(
      {
        method: 'tools/call',
        params: { name: 'sc_run_file', arguments: { path: '/tmp/test.scd' } },
      },
      { signal: new AbortController().signal },
    );

    expect(mockReadScdFile).toHaveBeenCalledWith('/tmp/test.scd');
    expect(driver.runFile).toHaveBeenCalled();
    expect(runResponse.content[0].text).toContain('"compliance"');
    expect(runResponse.content[0].text).toContain('"status": "not_applicable"');

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
    const renderResponse = await callToolHandler(
      {
        method: 'tools/call',
        params: {
          name: 'sc_render',
          arguments: {
            out: '/tmp/out.wav',
            code: '{ SinOsc.ar(330) }.play;',
            task_tag: 'sc-audio-generation',
          },
        },
      },
      { signal: new AbortController().signal },
    );

    expect(renderResponse.content[0].text).toContain('"compliance"');
    expect(renderResponse.content[0].text).toContain('"task_tag": "sc-audio-generation"');
    expect(renderResponse.content[0].text).toContain('"source_kind": "inline_code"');
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
