import { describe, expect, it } from 'vitest';
import { buildArchiveMemorySummary } from '../../src/archive/memory-summary.js';
import { ArchiveRecord } from '../../src/archive/archive-types.js';

function makeRecord<TPayload>(record: ArchiveRecord<TPayload>): ArchiveRecord<TPayload> {
  return record;
}

describe('buildArchiveMemorySummary', () => {
  it('aggregates archive records into deterministic project memory signals', () => {
    const records = [
      makeRecord({
        id: 'probe-1',
        kind: 'probe_run',
        session_id: 'session-a',
        created_at: '2026-06-13T00:00:01.000Z',
        payload: {
          spec: { mode: 'render' },
          result: { probe_id: 'probe-render-1', success: true },
        },
      }),
      makeRecord({
        id: 'cand-create-1',
        kind: 'candidate_lifecycle',
        session_id: 'session-a',
        created_at: '2026-06-13T00:00:02.000Z',
        payload: {
          candidate_id: 'cand-1',
          event: {
            candidate_id: 'cand-1',
            to_status: 'draft',
          },
        },
      }),
      makeRecord({
        id: 'cand-promote-1',
        kind: 'candidate_lifecycle',
        session_id: 'session-a',
        created_at: '2026-06-13T00:00:03.000Z',
        payload: {
          candidate_id: 'cand-1',
          event: {
            candidate_id: 'cand-1',
            to_status: 'candidate',
          },
        },
      }),
      makeRecord({
        id: 'review-1',
        kind: 'review_note',
        session_id: 'session-a',
        created_at: '2026-06-13T00:00:04.000Z',
        payload: {
          candidate_id: 'cand-1',
          review: {
            verdict: 'reject',
            summary: 'Transient smear',
          },
        },
      }),
      makeRecord({
        id: 'summary-1',
        kind: 'session_summary',
        session_id: 'session-a',
        created_at: '2026-06-13T00:00:05.000Z',
        payload: {
          outcome: 'mixed',
          preserved_items: ['cand-1', 'render:/tmp/a.wav', 'render:/tmp/b.wav'],
          failures: ['Timing drift'],
        },
      }),
      makeRecord({
        id: 'probe-2',
        kind: 'probe_run',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:06.000Z',
        payload: {
          spec: { mode: 'eval' },
          result: { probe_id: 'probe-eval-1', success: false },
        },
      }),
      makeRecord({
        id: 'cand-create-2',
        kind: 'candidate_lifecycle',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:07.000Z',
        payload: {
          candidate_id: 'cand-2',
          event: {
            candidate_id: 'cand-2',
            to_status: 'draft',
          },
        },
      }),
      makeRecord({
        id: 'cand-reject-2',
        kind: 'candidate_lifecycle',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:08.000Z',
        payload: {
          candidate_id: 'cand-2',
          event: {
            candidate_id: 'cand-2',
            to_status: 'rejected',
          },
        },
      }),
      makeRecord({
        id: 'review-2',
        kind: 'review_note',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:09.000Z',
        payload: {
          candidate_id: 'cand-2',
          review: {
            verdict: 'reject',
            summary: 'Transient smear',
          },
        },
      }),
      makeRecord({
        id: 'summary-2',
        kind: 'session_summary',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:10.000Z',
        payload: {
          outcome: 'failure',
          preserved_items: ['candidate:cand-2', 'render:/tmp/c.wav', '/tmp/debug.log'],
          failures: ['Timing drift', 'DC offset'],
        },
      }),
    ];

    const summary = buildArchiveMemorySummary(records);

    expect(summary.records_considered).toBe(10);
    expect(summary.recent_sessions).toEqual([
      {
        session_id: 'session-b',
        last_recorded_at: '2026-06-13T00:00:10.000Z',
        record_count: 5,
        audit_count: 0,
        kinds: ['candidate_lifecycle', 'probe_run', 'review_note', 'session_summary'],
        candidate_ids: ['cand-2'],
        probe_ids: ['probe-eval-1'],
        outcomes: ['failure'],
      },
      {
        session_id: 'session-a',
        last_recorded_at: '2026-06-13T00:00:05.000Z',
        record_count: 5,
        audit_count: 0,
        kinds: ['candidate_lifecycle', 'probe_run', 'review_note', 'session_summary'],
        candidate_ids: ['cand-1'],
        probe_ids: ['probe-render-1'],
        outcomes: ['mixed'],
      },
    ]);
    expect(summary.candidate_counts_by_status).toEqual({
      accepted: 0,
      candidate: 1,
      draft: 0,
      rejected: 1,
      revisit: 0,
    });
    expect(summary.review_rejection_reason_distribution).toEqual({
      'transient smear': 2,
    });
    expect(summary.repeated_failures).toEqual([
      {
        failure: 'timing drift',
        count: 2,
        session_ids: ['session-a', 'session-b'],
        candidate_ids: ['cand-1', 'cand-2'],
      },
    ]);
    expect(summary.preserved_item_patterns).toEqual([
      {
        pattern: 'render',
        count: 3,
        examples: ['render:/tmp/a.wav', 'render:/tmp/b.wav', 'render:/tmp/c.wav'],
      },
      {
        pattern: 'candidate_id',
        count: 2,
        examples: ['cand-1', 'candidate:cand-2'],
      },
      {
        pattern: 'path',
        count: 1,
        examples: ['/tmp/debug.log'],
      },
    ]);
    expect(summary.probe_run_outcomes).toEqual({
      total: 2,
      success: 1,
      failure: 1,
    });
    expect(summary.probe_run_modes).toEqual({
      eval: 1,
      render: 1,
    });
    expect(summary.session_outcomes).toEqual({
      failure: 1,
      mixed: 1,
      success: 0,
    });
  });

  it('supports deterministic filtering by session, candidate, and limit', () => {
    const records = [
      makeRecord({
        id: 'session-c-summary',
        kind: 'session_summary',
        session_id: 'session-c',
        created_at: '2026-06-13T00:00:11.000Z',
        payload: {
          outcome: 'success',
          preserved_items: ['cand-3', 'render:/tmp/final.wav'],
          failures: [],
        },
      }),
      makeRecord({
        id: 'session-b-summary',
        kind: 'session_summary',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:10.000Z',
        payload: {
          outcome: 'failure',
          preserved_items: ['candidate:cand-2'],
          failures: ['Timing drift'],
        },
      }),
      makeRecord({
        id: 'session-b-review',
        kind: 'review_note',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:09.000Z',
        payload: {
          candidate_id: 'cand-2',
          review: {
            verdict: 'reject',
            summary: 'Timing drift',
          },
        },
      }),
      makeRecord({
        id: 'session-b-lifecycle',
        kind: 'candidate_lifecycle',
        session_id: 'session-b',
        created_at: '2026-06-13T00:00:08.000Z',
        payload: {
          candidate_id: 'cand-2',
          event: {
            candidate_id: 'cand-2',
            to_status: 'rejected',
          },
        },
      }),
    ];

    const byCandidate = buildArchiveMemorySummary(records, {
      candidate_id: 'cand-2',
      limit: 2,
    });
    const bySession = buildArchiveMemorySummary(records, {
      session_id: 'session-c',
    });

    expect(byCandidate.records_considered).toBe(3);
    expect(byCandidate.recent_sessions).toEqual([
      {
        session_id: 'session-b',
        last_recorded_at: '2026-06-13T00:00:10.000Z',
        record_count: 3,
        audit_count: 0,
        kinds: ['candidate_lifecycle', 'review_note', 'session_summary'],
        candidate_ids: ['cand-2'],
        probe_ids: [],
        outcomes: ['failure'],
      },
    ]);
    expect(byCandidate.candidate_counts_by_status).toEqual({
      accepted: 0,
      candidate: 0,
      draft: 0,
      rejected: 1,
      revisit: 0,
    });
    expect(byCandidate.review_rejection_reason_distribution).toEqual({
      'timing drift': 1,
    });

    expect(bySession.records_considered).toBe(1);
    expect(bySession.recent_sessions[0].session_id).toBe('session-c');
    expect(bySession.session_outcomes).toEqual({
      failure: 0,
      mixed: 0,
      success: 1,
    });
  });

  it('tracks draft vs NRT outcomes and final artifact completion', () => {
    const records = [
      makeRecord({
        id: 'draft-probe',
        kind: 'probe_run',
        session_id: 'session-draft',
        created_at: '2026-06-13T00:01:00.000Z',
        payload: {
          spec: { mode: 'render' },
          result: {
            probe_id: 'probe-draft',
            success: true,
            summary: 'draft ok',
            artifacts: [{ kind: 'render', path: '/tmp/draft.wav', bytes: 64, render_mode: 'draft' }],
          },
        },
      }),
      makeRecord({
        id: 'nrt-probe-success',
        kind: 'probe_run',
        session_id: 'session-nrt-a',
        created_at: '2026-06-13T00:01:01.000Z',
        payload: {
          spec: { mode: 'render_nrt' },
          result: {
            probe_id: 'probe-nrt-a',
            success: true,
            summary: 'nrt ok',
            artifacts: [{ kind: 'render', path: '/tmp/nrt-a.wav', bytes: 128, render_mode: 'nrt' }],
          },
        },
      }),
      makeRecord({
        id: 'nrt-probe-fail',
        kind: 'probe_run',
        session_id: 'session-nrt-b',
        created_at: '2026-06-13T00:01:02.000Z',
        payload: {
          spec: { mode: 'render_nrt' },
          result: {
            probe_id: 'probe-nrt-b',
            success: false,
            summary: 'engine failed',
            artifacts: [],
          },
        },
      }),
    ];

    const summary = buildArchiveMemorySummary(records);

    expect(summary.render_mode_outcomes).toEqual({
      draft: {
        total: 1,
        success: 1,
        failure: 0,
      },
      nrt: {
        total: 2,
        success: 1,
        failure: 1,
      },
    });
    expect(summary.nrt_failure_distribution).toEqual({
      'engine failed': 1,
    });
    expect(summary.final_artifact_completion_ratio).toBe(0.5);
  });
});
