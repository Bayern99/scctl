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
        verification: {
          exists: true,
          non_empty: true,
          output_error_detected: false,
          stop_completed: true,
          failure_reasons: [],
        },
      },
    };
  }
}

async function makeTempDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('governed loop e2e', () => {
  it('persists probe, summary, and session_audit records through orchestration', async () => {
    const archiveRoot = await makeTempDir('scctl-governed-loop-');
    const workflowService = new WorkflowService({
      archiveRoot,
      driver: new FakeDriver() as any,
    });
    const orchestrationService = new OrchestrationService({ workflowService });

    const probe = await workflowService.runProbeCommand({
      spec: {
        id: 'probe-governed',
        title: 'Governed probe',
        question: 'Does the loop persist?',
        mode: 'eval',
        code: '{ SinOsc.ar(440, 0, 0.01) }.play;',
        tags: ['sc-probe'],
      },
    });

    expect(probe.success).toBe(true);
    if (!probe.success) {
      throw new Error(probe.summary);
    }

    const sessionId = probe.payload!.probe_run.session_id;

    const summary = await workflowService.summarizeSessionCommand({
      session_id: sessionId,
      task: 'governed probe',
      outcome: 'mixed',
      preserved_items: ['slow envelope contour'],
      failures: [],
      notes: ['keep modulation shape'],
    });
    expect(summary.success).toBe(true);

    const audit = await orchestrationService.auditSession({
      session_id: sessionId,
      task_tag: 'sc-probe',
    });

    expect(audit.success).toBe(true);

    const archive = new ArchiveStore(archiveRoot);
    const records = await archive.listBySession(sessionId);
    const kinds = records.map((record) => record.kind);

    expect(kinds).toContain('probe_run');
    expect(kinds).toContain('session_summary');
    expect(kinds).toContain('session_audit');

    const auditRecords = records.filter((record) => record.kind === 'session_audit');
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]?.payload).toMatchObject({
      records_considered: expect.any(Number),
      task_tag: 'sc-probe',
    });
  });
});
