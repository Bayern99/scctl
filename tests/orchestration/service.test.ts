import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ArchiveStore } from '../../src/archive/archive-store.js';
import { OrchestrationService } from '../../src/orchestration/service.js';
import { WorkflowService } from '../../src/workflow/service.js';

class FakeDriver {
  async eval(code: string) {
    return {
      success: true,
      summary: 'eval ok',
      raw_output: code,
      artifact: undefined,
    };
  }

  async runFile(filePath: string) {
    return {
      success: true,
      summary: 'run file ok',
      raw_output: filePath,
      artifact: undefined,
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
      summary: 'render ok',
      raw_output: userCode,
      artifact: {
        path: outPath,
        bytes: 128,
        duration_sec: 1,
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
      },
    };
  }
}

async function makeTempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeKbFiles(
  kbRoot: string,
  files: Record<string, string>,
) {
  await fs.mkdir(kbRoot, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      fs.writeFile(path.join(kbRoot, name), content, 'utf8')),
  );
}

async function makeServices() {
  const archiveRoot = await makeTempDir('scctl-orchestration-archive-');
  const kbRoot = await makeTempDir('scctl-orchestration-kb-');
  const workflowService = new WorkflowService({
    archiveRoot,
    driver: new FakeDriver() as any,
  });
  const orchestrationService = new OrchestrationService({
    workflowService,
    kbRoot,
  });

  return { archiveRoot, kbRoot, orchestrationService, workflowService };
}

describe('OrchestrationService', () => {
  it('prepares stable role packets for probe, render QA, and candidate promotion', async () => {
    const { kbRoot, orchestrationService } = await makeServices();
    await writeKbFiles(kbRoot, {
      'project-rules.md': '- stay in Pilot\n',
      'render-checklist.md': '- render exists\n',
      'evaluation-rubric.md': '- route first\n',
      'known-failures.md': '- no summary\n',
      'allowed-primitives.md': '- SinOsc\n',
    });

    const probe = await orchestrationService.prepareHandoff({
      task_id: 'task-probe',
      task_tag: 'sc-probe',
      goal: 'Explore a brittle transient',
      requested_outcome: 'explore',
    });
    const renderQa = await orchestrationService.prepareHandoff({
      task_id: 'task-render',
      task_tag: 'sc-render-review',
      goal: 'Review a draft render',
      requested_outcome: 'review',
    });
    const promotion = await orchestrationService.prepareHandoff({
      task_id: 'task-promote',
      task_tag: 'sc-render-review',
      goal: 'Decide whether to promote the primitive',
      requested_outcome: 'promote',
    });

    expect(probe.success).toBe(true);
    expect(renderQa.success).toBe(true);
    expect(promotion.success).toBe(true);

    if (!probe.success || !renderQa.success || !promotion.success) {
      throw new Error('Expected governed handoff preparation to succeed.');
    }

    expect(probe.payload.workflow_plan.selection.workflow).toBe('probe');
    expect(renderQa.payload.workflow_plan.selection.workflow).toBe('render_qa');
    expect(promotion.payload.workflow_plan.selection.workflow).toBe('candidate_promotion');

    expect(probe.payload.role_packets.builder.allowed_tools).toEqual(['sc_run_probe']);
    expect(renderQa.payload.role_packets.builder.allowed_tools).toEqual(['sc_run_probe']);
    expect(promotion.payload.role_packets.builder.allowed_tools).toEqual(['sc_run_probe']);
    expect(probe.payload.role_packets.critic.allowed_tools).not.toEqual(
      expect.arrayContaining(['sc_eval', 'sc_run_file', 'sc_render']),
    );
    expect(probe.payload.recommended_loop).toEqual([
      'prepare_handoff',
      'run_probe',
      'summarize_session',
      'add_review / candidate_action',
      'audit_session',
      'memory_summary',
    ]);
  });

  it('adds sc_render_nrt to builder tools for final_nrt handoffs', async () => {
    const { kbRoot, orchestrationService } = await makeServices();
    await writeKbFiles(kbRoot, {
      'project-rules.md': '- stay in Pilot\n',
    });

    const result = await orchestrationService.prepareHandoff({
      task_id: 'task-final-nrt',
      task_tag: 'sc-render-review',
      goal: 'Render a final-quality artifact',
      requested_outcome: 'review',
      quality: {
        render_tier: 'final_nrt',
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.summary);
    }

    expect(result.payload.role_packets.builder.allowed_tools).toEqual([
      'sc_run_probe',
      'sc_render_nrt',
    ]);
  });

  it('builds valid KB snapshots for empty, sparse, and memory-backed cases', async () => {
    const empty = await makeServices();
    const emptyResult = await empty.orchestrationService.prepareHandoff({
      task_id: 'task-empty-kb',
      task_tag: 'sc-probe',
      goal: 'Probe with empty KB',
      requested_outcome: 'explore',
    });

    expect(emptyResult.success).toBe(true);
    if (!emptyResult.success) {
      throw new Error(emptyResult.summary);
    }
    expect(emptyResult.payload.kb_snapshot.project_rules).toEqual([]);
    expect(emptyResult.payload.kb_snapshot.allowed_primitives).toEqual([]);
    expect(emptyResult.payload.kb_snapshot.memory_summary_excerpt).toBeUndefined();

    const sparse = await makeServices();
    await writeKbFiles(sparse.kbRoot, {
      'allowed-primitives.md': '- PinkNoise\n',
    });
    await sparse.workflowService.summarizeSessionCommand({
      session_id: 'memory-backed-session',
      task: 'Document a prior loop',
      outcome: 'mixed',
      preserved_items: ['render:/tmp/a.wav'],
      failures: ['tail too bright'],
    });

    const sparseResult = await sparse.orchestrationService.prepareHandoff({
      task_id: 'task-sparse-kb',
      task_tag: 'sc-render-review',
      goal: 'Review with sparse KB',
      requested_outcome: 'review',
      memory_options: { session_id: 'memory-backed-session' },
    });

    expect(sparseResult.success).toBe(true);
    if (!sparseResult.success) {
      throw new Error(sparseResult.summary);
    }
    expect(sparseResult.payload.kb_snapshot.allowed_primitives).toEqual(['PinkNoise']);
    expect(sparseResult.payload.kb_snapshot.memory_summary_excerpt).toEqual(
      expect.arrayContaining([expect.stringContaining('Records considered')]),
    );
  });

  it('does not import ScDriver directly', async () => {
    const content = await fs.readFile(
      path.resolve(process.cwd(), 'src/orchestration/service.ts'),
      'utf8',
    );

    expect(content).not.toContain('ScDriver');
  });

  it('returns a structured invalid audit when no session trace exists', async () => {
    const { orchestrationService } = await makeServices();
    const result = await orchestrationService.auditSession({
      session_id: 'missing-session',
    });

    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('invalid_argument');
    expect(result.payload?.session_audit.recommended_next_step).toBe('retry');
    expect(result.payload?.session_audit.path_compliance.status).toBe('fail');
  });

  it('recommends revise when a probe run exists without a session summary', async () => {
    const { orchestrationService, workflowService } = await makeServices();
    const probe = await workflowService.runProbeCommand({
      spec: {
        id: 'probe-no-summary',
        title: 'Probe only',
        question: 'Leave the summary out',
        mode: 'eval',
        code: '{ WhiteNoise.ar(0.01) }.play;',
        tags: ['sc-probe'],
      },
    });

    expect(probe.success).toBe(true);
    if (!probe.success) {
      throw new Error(probe.summary);
    }

    const audit = await orchestrationService.auditSession({
      session_id: probe.payload.probe_run.session_id,
      task_tag: 'sc-probe',
    });

    expect(audit.success).toBe(true);
    if (!audit.success) {
      throw new Error(audit.summary);
    }

    expect(audit.payload.session_audit.summary_present.status).toBe('fail');
    expect(audit.payload.session_audit.recommended_next_step).toBe('revise');
  });

  it('recommends revise when a render-review session lacks an explicit review note', async () => {
    const { orchestrationService, workflowService } = await makeServices();
    const probe = await workflowService.runProbeCommand({
      spec: {
        id: 'probe-render-review',
        title: 'Render review probe',
        question: 'Produce a render artifact',
        mode: 'render',
        code: '{ PinkNoise.ar(0.05) }.play;',
        render: {
          duration_sec: 0.25,
          out_path: '/tmp/render-review.wav',
        },
        tags: ['sc-render-review'],
      },
    });

    expect(probe.success).toBe(true);
    if (!probe.success) {
      throw new Error(probe.summary);
    }

    await workflowService.summarizeSessionCommand({
      session_id: probe.payload.probe_run.session_id,
      task: 'Render review',
      outcome: 'mixed',
      preserved_items: ['render:/tmp/render-review.wav'],
      failures: [],
    });

    const audit = await orchestrationService.auditSession({
      session_id: probe.payload.probe_run.session_id,
      task_tag: 'sc-render-review',
    });

    expect(audit.success).toBe(true);
    if (!audit.success) {
      throw new Error(audit.summary);
    }

    expect(audit.payload.session_audit.artifact_completion.status).toBe('pass');
    expect(audit.payload.session_audit.review_gate.required).toBe(true);
    expect(audit.payload.session_audit.review_gate.present).toBe(false);
    expect(audit.payload.session_audit.recommended_next_step).toBe('revise');
  });

  it('does not close a final_nrt audit when only a draft artifact exists', async () => {
    const { orchestrationService, workflowService } = await makeServices();
    const probe = await workflowService.runProbeCommand({
      spec: {
        id: 'probe-final-nrt-missing',
        title: 'Draft only',
        question: 'Produce only a draft artifact',
        mode: 'render',
        code: '{ PinkNoise.ar(0.05) }.play;',
        render: {
          duration_sec: 0.25,
          out_path: '/tmp/final-nrt-missing.wav',
        },
        tags: ['sc-render-review'],
      },
    });

    expect(probe.success).toBe(true);
    if (!probe.success) {
      throw new Error(probe.summary);
    }

    await workflowService.summarizeSessionCommand({
      session_id: probe.payload.probe_run.session_id,
      task: 'Final NRT audit',
      outcome: 'mixed',
      preserved_items: ['render:/tmp/final-nrt-missing.wav'],
      failures: [],
    });

    const audit = await orchestrationService.auditSession({
      session_id: probe.payload.probe_run.session_id,
      task_tag: 'sc-render-review',
      quality: {
        render_tier: 'final_nrt',
      },
    });

    expect(audit.success).toBe(true);
    if (!audit.success) {
      throw new Error(audit.summary);
    }

    expect(audit.payload.session_audit.artifact_completion.status).toBe('fail');
    expect(audit.payload.session_audit.artifact_completion.required_render_mode).toBe('nrt');
    expect(audit.payload.session_audit.recommended_next_step).toBe('retry');
  });

  it('recommends accept for a complete governed candidate session and revise for a synthetic promotion without review', async () => {
    const complete = await makeServices();
    const completeProbe = await complete.workflowService.runProbeCommand({
      spec: {
        id: 'probe-complete',
        title: 'Complete candidate probe',
        question: 'Produce a render before promotion',
        mode: 'render',
        code: '{ PinkNoise.ar(0.04) }.play;',
        render: {
          duration_sec: 0.25,
          out_path: '/tmp/complete-candidate.wav',
        },
        tags: ['sc-render-review'],
      },
    });
    expect(completeProbe.success).toBe(true);
    if (!completeProbe.success) {
      throw new Error(completeProbe.summary);
    }

    await complete.workflowService.candidateActionCommand({
      session_id: completeProbe.payload.probe_run.session_id,
      action: 'create_draft',
      candidate_id: 'cand-complete',
      name: 'metal bloom',
      source_probe_id: 'probe-complete',
    });
    await complete.workflowService.candidateActionCommand({
      session_id: completeProbe.payload.probe_run.session_id,
      action: 'promote',
      candidate_id: 'cand-complete',
      review: {
        reviewer: 'critic',
        verdict: 'keep',
        summary: 'Ready to promote.',
      },
    });
    await complete.workflowService.summarizeSessionCommand({
      session_id: completeProbe.payload.probe_run.session_id,
      task: 'Promotion summary',
      outcome: 'success',
      preserved_items: ['candidate:cand-complete', 'render:/tmp/complete-candidate.wav'],
      failures: [],
    });

    const completeAudit = await complete.orchestrationService.auditSession({
      session_id: completeProbe.payload.probe_run.session_id,
      task_tag: 'sc-render-review',
      candidate_id: 'cand-complete',
    });

    expect(completeAudit.success).toBe(true);
    if (!completeAudit.success) {
      throw new Error(completeAudit.summary);
    }
    expect(completeAudit.payload.session_audit.candidate_state.status).toBe('candidate');
    expect(completeAudit.payload.session_audit.recommended_next_step).toBe('accept');

    const completeArchive = new ArchiveStore(complete.archiveRoot);
    const completeRecords = await completeArchive.listBySession(
      completeProbe.payload.probe_run.session_id,
    );
    expect(completeRecords.some((record) => record.kind === 'session_audit')).toBe(true);

    const syntheticArchiveRoot = await makeTempDir('scctl-orchestration-synthetic-');
    const syntheticKbRoot = await makeTempDir('scctl-orchestration-synthetic-kb-');
    const syntheticArchive = new ArchiveStore(syntheticArchiveRoot);
    await syntheticArchive.append({
      kind: 'candidate_lifecycle',
      session_id: 'synthetic-session',
      created_at: '2026-06-13T00:00:00.000Z',
      payload: {
        candidate_id: 'cand-synthetic',
        name: 'synthetic',
        source_probe_id: 'probe-synthetic',
        event: {
          candidate_id: 'cand-synthetic',
          action: 'create',
          from_status: null,
          to_status: 'draft',
          summary: 'created',
          created_at: '2026-06-13T00:00:00.000Z',
        },
      },
    });
    await syntheticArchive.append({
      kind: 'probe_run',
      session_id: 'synthetic-session',
      created_at: '2026-06-13T00:00:00.500Z',
      payload: {
        spec: {
          mode: 'render',
        },
        result: {
          probe_id: 'probe-synthetic',
          session_id: 'synthetic-session',
          success: true,
          summary: 'rendered',
          raw_output: '',
          artifacts: [{ kind: 'render', path: '/tmp/synthetic.wav', bytes: 64 }],
          started_at: '2026-06-13T00:00:00.100Z',
          finished_at: '2026-06-13T00:00:00.500Z',
        },
      },
    });
    await syntheticArchive.append({
      kind: 'candidate_lifecycle',
      session_id: 'synthetic-session',
      created_at: '2026-06-13T00:00:01.000Z',
      payload: {
        candidate_id: 'cand-synthetic',
        event: {
          candidate_id: 'cand-synthetic',
          action: 'promote',
          from_status: 'draft',
          to_status: 'candidate',
          summary: 'promoted without review',
          created_at: '2026-06-13T00:00:01.000Z',
        },
      },
    });
    await syntheticArchive.append({
      kind: 'session_summary',
      session_id: 'synthetic-session',
      created_at: '2026-06-13T00:00:02.000Z',
      payload: {
        session_id: 'synthetic-session',
        task: 'Synthetic promotion',
        outcome: 'mixed',
        summary: 'synthetic summary',
        preserved_items: ['candidate:cand-synthetic'],
        failures: [],
        notes: [],
        created_at: '2026-06-13T00:00:02.000Z',
      },
    });

    const synthetic = new OrchestrationService({
      archiveRoot: syntheticArchiveRoot,
      kbRoot: syntheticKbRoot,
    });
    const syntheticAudit = await synthetic.auditSession({
      session_id: 'synthetic-session',
      task_tag: 'sc-render-review',
      candidate_id: 'cand-synthetic',
    });

    expect(syntheticAudit.success).toBe(true);
    if (!syntheticAudit.success) {
      throw new Error(syntheticAudit.summary);
    }
    expect(syntheticAudit.payload.session_audit.review_gate.status).toBe('fail');
    expect(syntheticAudit.payload.session_audit.recommended_next_step).toBe('revise');
  });
});
