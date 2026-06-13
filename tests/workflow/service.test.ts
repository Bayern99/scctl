import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WorkflowService } from '../../src/workflow/service.js';

class FakeDriver {
  async eval(code: string) {
    return {
      success: true,
      state: 'ready',
      phase: 'eval',
      session_id: 'session-eval',
      recoverable: true,
      error_kind: null,
      summary: 'eval ok',
      raw_output: code,
      session: {
        state: 'ready',
        phase: 'eval',
        session_id: 'session-eval',
        engine_path: '/mock/sclang',
        has_controller: true,
        busy: false,
        last_error_kind: null,
        recoverable: true,
      },
    };
  }

  async runFile(filePath: string, readFile: (path: string) => string) {
    return {
      success: true,
      state: 'ready',
      phase: 'run_file',
      session_id: 'session-run',
      recoverable: true,
      error_kind: null,
      summary: 'run ok',
      raw_output: readFile(filePath),
      session: {
        state: 'ready',
        phase: 'run_file',
        session_id: 'session-run',
        engine_path: '/mock/sclang',
        has_controller: true,
        busy: false,
        last_error_kind: null,
        recoverable: true,
      },
    };
  }

  async render({
    outPath,
    userCode,
  }: {
    durationSec: number;
    outPath: string;
    userCode: string;
  }) {
    return {
      success: true,
      state: 'stopped',
      phase: 'render',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'render ok',
      raw_output: userCode,
      artifact: {
        path: outPath,
        bytes: 128,
        duration_sec: 1,
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
    };
  }

  async renderNrt({
    outPath,
  }: {
    durationSec?: number;
    enginePreference?: 'auto' | 'scsynth' | 'supernova';
    outPath: string;
    sampleFormat?: 'float' | 'double';
    sourcePath: string;
  }) {
    return {
      success: true,
      state: 'stopped',
      phase: 'render_nrt',
      session_id: null,
      recoverable: true,
      error_kind: null,
      summary: 'render nrt ok',
      raw_output: 'nrt ok',
      artifact: {
        path: outPath,
        bytes: 256,
        duration_sec: 1,
        render_mode: 'nrt' as const,
        engine_used: 'scsynth' as const,
        sample_rate: 48000,
        sample_format: 'float' as const,
        channel_count: 2,
        frame_count: 48000,
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
    };
  }
}

function makeService() {
  return new WorkflowService({
    archiveRoot: path.join(os.tmpdir(), `scctl-workflow-${Date.now()}-${Math.random()}`),
    driver: new FakeDriver() as any,
  });
}

describe('WorkflowService', () => {
  it('resolves archive root from options', () => {
    const archiveRoot = path.join(os.tmpdir(), `scctl-workflow-${Date.now()}`);
    const service = new WorkflowService({
      archiveRoot,
      driver: new FakeDriver() as any,
    });

    expect(service.getArchiveRoot()).toBe(archiveRoot);
  });

  it('plans workflows from a valid spec', async () => {
    const service = makeService();
    const result = await service.planWorkflow({
      spec: {
        schema_version: '0.1.0',
        title: 'Metal bloom probe',
        task_label: 'sc-probe',
        workflow: 'probe',
        intent: {
          prompt: 'Find a brittle metallic transient.',
          goals: ['Explore', 'Stay concise'],
          constraints: ['Use Pilot'],
        },
        sound: {
          timbre_keywords: ['metallic', 'brittle'],
        },
        execution: {
          mode: 'eval',
          code: '{ SinOsc.ar(440) }.play;',
        },
        evaluation: {
          success_signals: ['interesting transient'],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.payload?.validated_spec?.title).toBe('Metal bloom probe');
    expect(result.payload?.selection.workflow).toBe('probe');
    expect(result.payload?.path_expectation.required_steps).toEqual([
      'sc_run_probe',
      'sc_summarize_session',
    ]);
    expect(result.payload?.planner_system_prompt).toContain('SuperCollider Pilot planner');
  });

  it('recommends render_nrt for final-quality specs', async () => {
    const service = makeService();
    const result = await service.planWorkflow({
      spec: {
        schema_version: '0.1.0',
        title: 'Final NRT render',
        task_label: 'sc-render-review',
        workflow: 'render_qa',
        intent: {
          prompt: 'Render a final-quality texture study.',
          goals: ['Produce a final artifact'],
          constraints: ['Use Pilot'],
        },
        sound: {
          timbre_keywords: ['airy', 'tonal'],
        },
        execution: {
          mode: 'render_nrt',
          file_path: '/tmp/final-nrt.scd',
        },
        evaluation: {
          success_signals: ['stable final artifact'],
        },
        quality: {
          render_tier: 'final_nrt',
          engine_preference: 'auto',
          sample_format: 'float',
        },
        context: {
          render_path: '/tmp/final.wav',
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.payload?.selection.recommended_execution_mode).toBe('render_nrt');
    expect(result.payload?.selection.primary_role).toBe('critic');
    expect(result.payload?.selection.recommended_tools).toEqual(
      expect.arrayContaining([
        'sc_prepare_handoff',
        'sc_run_probe',
        'sc_summarize_session',
        'sc_candidate_action:add_review',
        'sc_audit_session',
        'sc_memory_summary',
      ]),
    );
    expect(result.payload?.path_expectation.required_steps).toEqual([
      'sc_run_probe',
      'sc_summarize_session',
      'sc_candidate_action:add_review',
    ]);
  });

  it('returns validation issues for invalid specs without crashing', async () => {
    const service = makeService();
    const result = await service.planWorkflow({
      spec: {
        schema_version: '0.1.0',
        title: '',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('invalid_argument');
    expect(result.payload?.validation?.issues.length).toBeGreaterThan(0);
  });

  it('runs probes and archives probe results', async () => {
    const service = makeService();
    const result = await service.runProbeCommand({
      spec: {
        id: 'probe-1',
        title: 'Probe',
        question: 'What happens?',
        mode: 'eval',
        code: '{ WhiteNoise.ar(0.01) }.play;',
        tags: ['sc-probe'],
      },
    });

    expect(result.success).toBe(true);
    expect(result.payload?.probe_run.probe_id).toBe('probe-1');
    expect(result.payload?.evals.path_compliance.compliance_rate).toBe(1);
  });

  it('runs NRT probes and records render quality metadata', async () => {
    const service = makeService();
    const sourcePath = path.join(os.tmpdir(), `scctl-workflow-nrt-${Date.now()}.scd`);
    await import('fs/promises').then(({ writeFile }) =>
      writeFile(sourcePath, '// nrt probe source\n', 'utf8'));

    const result = await service.runProbeCommand({
      spec: {
        id: 'probe-nrt',
        title: 'NRT probe',
        question: 'Can final NRT probe run?',
        mode: 'render_nrt',
        file_path: sourcePath,
        render: {
          out_path: '/tmp/probe-nrt.wav',
          sample_format: 'float',
        },
        tags: ['sc-render-review'],
      },
    });

    expect(result.success).toBe(true);
    expect(result.payload?.probe_run.artifacts[0]).toMatchObject({
      kind: 'render',
      render_mode: 'nrt',
    });
    expect(result.payload?.evals.render_quality).not.toBeNull();
  });

  it('writes session summaries and reuses archived probe ids when available', async () => {
    const service = makeService();
    await service.runProbeCommand({
      spec: {
        id: 'probe-sum',
        title: 'Probe',
        question: 'What happens?',
        mode: 'eval',
        code: '{ PinkNoise.ar(0.01) }.play;',
        tags: ['sc-probe'],
      },
    });

    const run = await service.runProbeCommand({
      spec: {
        id: 'probe-sum-2',
        title: 'Probe 2',
        question: 'What happens next?',
        mode: 'eval',
        code: '{ BrownNoise.ar(0.01) }.play;',
        tags: ['sc-probe'],
      },
    });

    const summary = await service.summarizeSessionCommand({
      session_id: run.payload!.probe_run.session_id,
      task: 'Probe review',
      outcome: 'success',
      preserved_items: ['metal bloom'],
      failures: [],
      probe_id: 'probe-sum-2',
    });

    expect(summary.success).toBe(true);
    expect(summary.payload?.summary.probe_id).toBe('probe-sum-2');
  });

  it('applies candidate actions with a review gate and returns memory summaries', async () => {
    const service = makeService();
    const create = await service.candidateActionCommand({
      action: 'create_draft',
      candidate_id: 'cand-1',
      name: 'metal bloom',
      session_id: 'sess-1',
      source_probe_id: 'probe-1',
    });

    expect(create.success).toBe(true);

    const promoteFail = await service.candidateActionCommand({
      action: 'promote',
      candidate_id: 'cand-1',
      session_id: 'sess-1',
    });
    expect(promoteFail.success).toBe(false);

    const promote = await service.candidateActionCommand({
      action: 'promote',
      candidate_id: 'cand-1',
      session_id: 'sess-1',
      review: {
        reviewer: 'critic',
        verdict: 'keep',
        summary: 'Strong candidate.',
      },
    });

    expect(promote.success).toBe(true);
    expect(promote.payload?.candidate.status).toBe('candidate');

    await service.summarizeSessionCommand({
      session_id: 'sess-1',
      task: 'Promotion review',
      outcome: 'mixed',
      preserved_items: ['metal bloom'],
      failures: ['transient too bright'],
    });

    const memory = await service.memorySummaryCommand({});
    expect(memory.success).toBe(true);
    expect(memory.payload?.memory_summary.candidate_counts_by_status.candidate).toBe(1);
    expect(memory.payload?.memory_summary.preserved_item_patterns[0]).toEqual(
      expect.objectContaining({
        pattern: 'metal',
        examples: ['metal bloom'],
      }),
    );
  });
});
