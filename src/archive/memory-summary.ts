import {
  ArchiveMemorySummary,
  ArchiveMemorySummaryOptions,
  ArchivePreservedItemPatternSummary,
  ArchiveRecord,
  ArchiveRecordKind,
  ArchiveRecentSessionSummary,
  ArchiveRepeatedFailureSummary,
} from './archive-types.js';
import {
  collectArchiveCandidateIds,
  normalizeArchiveCandidateId,
  normalizeArchiveText,
  recordMatchesArchiveCandidate,
  selectRecentSessionWindow,
  sortArchiveRecords,
} from './archive-query.js';

type CandidateStatus = 'draft' | 'candidate' | 'accepted' | 'rejected' | 'revisit';

interface CandidateLifecyclePayload {
  candidate_id: string;
  event?: {
    candidate_id?: string;
    to_status?: CandidateStatus;
  };
}

interface CandidateReviewPayload {
  candidate_id: string;
  review?: {
    verdict?: 'keep' | 'reject' | 'revisit';
    summary?: string;
    details?: string;
  };
}

interface SessionSummaryPayload {
  outcome?: 'success' | 'failure' | 'mixed';
  preserved_items?: string[];
  failures?: string[];
}

interface ProbeRunArchivePayload {
  spec?: {
    mode?: string;
  };
  result?: {
    artifacts?: Array<{
      bytes?: number;
      kind?: string;
      path?: string;
      render_mode?: string;
    }>;
    probe_id?: string;
    success?: boolean;
    summary?: string;
  };
}

interface SessionAccumulator {
  session_id: string;
  last_recorded_at: string;
  record_count: number;
  audit_count: number;
  kinds: Set<ArchiveRecordKind>;
  candidate_ids: Set<string>;
  probe_ids: Set<string>;
  outcomes: Set<string>;
}

interface FailureAccumulator {
  count: number;
  session_ids: Set<string>;
  candidate_ids: Set<string>;
}

interface PatternAccumulator {
  count: number;
  examples: Set<string>;
}

const CANDIDATE_STATUS_ORDER: CandidateStatus[] = ['draft', 'candidate', 'accepted', 'rejected', 'revisit'];
const SESSION_OUTCOME_ORDER = ['success', 'failure', 'mixed'] as const;
const UNKNOWN_REJECTION_REASON = 'unspecified';

function getStatusFromLifecycle(record: ArchiveRecord<CandidateLifecyclePayload>): CandidateStatus | null {
  const status = record.payload?.event?.to_status;
  return status && CANDIDATE_STATUS_ORDER.includes(status) ? status : null;
}

function getReviewRejectionReason(record: ArchiveRecord<CandidateReviewPayload>): string | null {
  if (record.payload?.review?.verdict !== 'reject') {
    return null;
  }

  return normalizeArchiveText(record.payload.review.summary)
    ?? normalizeArchiveText(record.payload.review.details)
    ?? UNKNOWN_REJECTION_REASON;
}

function getProbeMode(record: ArchiveRecord<ProbeRunArchivePayload>): string | null {
  return normalizeArchiveText(record.payload?.spec?.mode);
}

function getRenderMode(record: ArchiveRecord<ProbeRunArchivePayload>): 'draft' | 'nrt' | null {
  const renderArtifact = record.payload?.result?.artifacts?.find((artifact) => artifact?.kind === 'render');
  const artifactMode = normalizeArchiveText(renderArtifact?.render_mode);
  if (artifactMode === 'draft' || artifactMode === 'nrt') {
    return artifactMode;
  }

  const probeMode = getProbeMode(record);
  if (probeMode === 'render_nrt') {
    return 'nrt';
  }
  if (probeMode === 'render') {
    return 'draft';
  }

  return null;
}

function getProbeRunOutcome(record: ArchiveRecord<ProbeRunArchivePayload>): 'success' | 'failure' | null {
  const success = record.payload?.result?.success;
  if (typeof success !== 'boolean') {
    return null;
  }

  return success ? 'success' : 'failure';
}

function hasFinalArtifact(record: ArchiveRecord<ProbeRunArchivePayload>): boolean {
  return Boolean(
    record.payload?.result?.artifacts?.some(
      (artifact) =>
        artifact?.kind === 'render'
        && artifact.render_mode === 'nrt'
        && (artifact.bytes ?? 0) > 0
        && normalizeArchiveText(artifact.path),
    ),
  );
}

function getNrtFailureReason(record: ArchiveRecord<ProbeRunArchivePayload>): string | null {
  if (getRenderMode(record) !== 'nrt' || getProbeRunOutcome(record) !== 'failure') {
    return null;
  }

  return normalizeArchiveText(record.payload?.result?.summary) ?? 'nrt_render_failed';
}

function getProbeId(record: ArchiveRecord<ProbeRunArchivePayload>): string | null {
  return normalizeArchiveText(record.payload?.result?.probe_id);
}

function getSessionOutcome(record: ArchiveRecord<SessionSummaryPayload>): string | null {
  return normalizeArchiveText(record.payload?.outcome);
}

function getPattern(item: string): string | null {
  const normalized = normalizeArchiveText(item);
  if (!normalized) {
    return null;
  }

  if (normalized.includes(':')) {
    const prefix = normalized.split(':', 1)[0];
    if (prefix === 'candidate' || prefix === 'cand' || prefix === 'candidate_id') {
      return 'candidate_id';
    }

    return prefix;
  }

  if (normalized.startsWith('/')) {
    return 'path';
  }

  if (/^cand[-_]/.test(normalized)) {
    return 'candidate_id';
  }

  const match = normalized.match(/^[a-z0-9]+(?:[_-][a-z0-9]+)*/);
  return match?.[0] ?? normalized;
}

function toSortedObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function toSortedStatsObject(
  map: Map<string, { total: number; success: number; failure: number }>,
): Record<string, { total: number; success: number; failure: number }> {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function finalizeRecentSessions(sessions: Map<string, SessionAccumulator>): ArchiveRecentSessionSummary[] {
  return [...sessions.values()]
    .sort((left, right) => {
      const createdAtCompare = right.last_recorded_at.localeCompare(left.last_recorded_at);
      if (createdAtCompare !== 0) {
        return createdAtCompare;
      }

      return left.session_id.localeCompare(right.session_id);
    })
    .map((session) => ({
      session_id: session.session_id,
      last_recorded_at: session.last_recorded_at,
      record_count: session.record_count,
      kinds: [...session.kinds].sort(),
      audit_count: session.audit_count,
      candidate_ids: [...session.candidate_ids].sort(),
      probe_ids: [...session.probe_ids].sort(),
      outcomes: [...session.outcomes].sort(),
    }));
}

function finalizeRepeatedFailures(failures: Map<string, FailureAccumulator>): ArchiveRepeatedFailureSummary[] {
  return [...failures.entries()]
    .filter(([, value]) => value.count > 1)
    .sort((left, right) => {
      const countCompare = right[1].count - left[1].count;
      if (countCompare !== 0) {
        return countCompare;
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([failure, value]) => ({
      failure,
      count: value.count,
      session_ids: [...value.session_ids].sort(),
      candidate_ids: [...value.candidate_ids].sort(),
    }));
}

function finalizePatterns(patterns: Map<string, PatternAccumulator>): ArchivePreservedItemPatternSummary[] {
  return [...patterns.entries()]
    .sort((left, right) => {
      const countCompare = right[1].count - left[1].count;
      if (countCompare !== 0) {
        return countCompare;
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([pattern, value]) => ({
      pattern,
      count: value.count,
      examples: [...value.examples].sort().slice(0, 3),
    }));
}

export function buildArchiveMemorySummary(
  records: ArchiveRecord[],
  options: ArchiveMemorySummaryOptions = {},
): ArchiveMemorySummary {
  const normalizedCandidateId = normalizeArchiveCandidateId(options.candidate_id);
  const matchedRecords = sortArchiveRecords(records).filter((record) => {
    if (options.session_id && record.session_id !== options.session_id) {
      return false;
    }

    if (normalizedCandidateId && !recordMatchesArchiveCandidate(record, normalizedCandidateId)) {
      return false;
    }

    return true;
  });

  const limitedRecords = selectRecentSessionWindow(matchedRecords, options.limit);

  const recentSessions = new Map<string, SessionAccumulator>();
  const latestCandidateStatus = new Map<string, CandidateStatus>();
  const rejectionReasons = new Map<string, number>();
  const repeatedFailures = new Map<string, FailureAccumulator>();
  const preservedPatterns = new Map<string, PatternAccumulator>();
  const probeRunModes = new Map<string, number>();
  const renderModeOutcomes = new Map<string, { total: number; success: number; failure: number }>();
  const nrtFailureDistribution = new Map<string, number>();
  const probeRunOutcomes = {
    total: 0,
    success: 0,
    failure: 0,
  };
  const sessionOutcomes = new Map<string, number>();
  let finalArtifactExpectedCount = 0;
  let finalArtifactCompletedCount = 0;

  for (const record of limitedRecords) {
    let session = recentSessions.get(record.session_id);
    if (!session) {
      session = {
        session_id: record.session_id,
        last_recorded_at: record.created_at,
        record_count: 0,
        audit_count: 0,
        kinds: new Set<ArchiveRecordKind>(),
        candidate_ids: new Set<string>(),
        probe_ids: new Set<string>(),
        outcomes: new Set<string>(),
      };
      recentSessions.set(record.session_id, session);
    }

    session.record_count += 1;
    session.kinds.add(record.kind);
    if (record.kind === 'session_audit') {
      session.audit_count += 1;
    }
    if (record.created_at > session.last_recorded_at) {
      session.last_recorded_at = record.created_at;
    }

    for (const candidateId of collectArchiveCandidateIds(record)) {
      session.candidate_ids.add(candidateId);
    }

    if (record.kind === 'candidate_lifecycle') {
      const candidateId = normalizeArchiveCandidateId((record.payload as CandidateLifecyclePayload).candidate_id);
      const status = getStatusFromLifecycle(record as ArchiveRecord<CandidateLifecyclePayload>);
      if (candidateId && status && !latestCandidateStatus.has(candidateId)) {
        latestCandidateStatus.set(candidateId, status);
      }
    }

    if (record.kind === 'review_note') {
      const rejectionReason = getReviewRejectionReason(record as ArchiveRecord<CandidateReviewPayload>);
      if (rejectionReason) {
        rejectionReasons.set(rejectionReason, (rejectionReasons.get(rejectionReason) ?? 0) + 1);
      }
    }

    if (record.kind === 'session_summary') {
      const payload = record.payload as SessionSummaryPayload;
      const outcome = getSessionOutcome(record as ArchiveRecord<SessionSummaryPayload>);
      if (outcome) {
        session.outcomes.add(outcome);
        sessionOutcomes.set(outcome, (sessionOutcomes.get(outcome) ?? 0) + 1);
      }

      for (const failure of payload.failures ?? []) {
        const normalizedFailure = normalizeArchiveText(failure);
        if (!normalizedFailure) {
          continue;
        }

        let failureEntry = repeatedFailures.get(normalizedFailure);
        if (!failureEntry) {
          failureEntry = {
            count: 0,
            session_ids: new Set<string>(),
            candidate_ids: new Set<string>(),
          };
          repeatedFailures.set(normalizedFailure, failureEntry);
        }

        failureEntry.count += 1;
        failureEntry.session_ids.add(record.session_id);
        for (const candidateId of collectArchiveCandidateIds(record)) {
          failureEntry.candidate_ids.add(candidateId);
        }
      }

      for (const item of payload.preserved_items ?? []) {
        const pattern = getPattern(item);
        const normalizedItem = normalizeArchiveText(item);
        if (!pattern || !normalizedItem) {
          continue;
        }

        let patternEntry = preservedPatterns.get(pattern);
        if (!patternEntry) {
          patternEntry = {
            count: 0,
            examples: new Set<string>(),
          };
          preservedPatterns.set(pattern, patternEntry);
        }

        patternEntry.count += 1;
        patternEntry.examples.add(normalizedItem);
      }
    }

    if (record.kind === 'probe_run') {
      const outcome = getProbeRunOutcome(record as ArchiveRecord<ProbeRunArchivePayload>);
      if (outcome) {
        probeRunOutcomes.total += 1;
        probeRunOutcomes[outcome] += 1;
      }

      const mode = getProbeMode(record as ArchiveRecord<ProbeRunArchivePayload>);
      if (mode) {
        probeRunModes.set(mode, (probeRunModes.get(mode) ?? 0) + 1);
      }

       const renderMode = getRenderMode(record as ArchiveRecord<ProbeRunArchivePayload>);
       if (renderMode) {
         const current = renderModeOutcomes.get(renderMode) ?? {
           total: 0,
           success: 0,
           failure: 0,
         };
         current.total += 1;
         if (outcome) {
           current[outcome] += 1;
         }
         renderModeOutcomes.set(renderMode, current);
       }

       const nrtFailureReason = getNrtFailureReason(record as ArchiveRecord<ProbeRunArchivePayload>);
       if (nrtFailureReason) {
         nrtFailureDistribution.set(
           nrtFailureReason,
           (nrtFailureDistribution.get(nrtFailureReason) ?? 0) + 1,
         );
       }

       if (mode === 'render_nrt') {
         finalArtifactExpectedCount += 1;
         if (hasFinalArtifact(record as ArchiveRecord<ProbeRunArchivePayload>)) {
           finalArtifactCompletedCount += 1;
         }
       }

      const probeId = getProbeId(record as ArchiveRecord<ProbeRunArchivePayload>);
      if (probeId) {
        session.probe_ids.add(probeId);
      }
    }
  }

  const candidateCounts = new Map<string, number>();
  for (const status of CANDIDATE_STATUS_ORDER) {
    candidateCounts.set(status, 0);
  }
  for (const status of latestCandidateStatus.values()) {
    candidateCounts.set(status, (candidateCounts.get(status) ?? 0) + 1);
  }

  const orderedSessionOutcomes = new Map<string, number>();
  for (const outcome of SESSION_OUTCOME_ORDER) {
    orderedSessionOutcomes.set(outcome, sessionOutcomes.get(outcome) ?? 0);
  }
  for (const [outcome, count] of sessionOutcomes.entries()) {
    if (!orderedSessionOutcomes.has(outcome)) {
      orderedSessionOutcomes.set(outcome, count);
    }
  }

  return {
    records_considered: limitedRecords.length,
    recent_sessions: finalizeRecentSessions(recentSessions),
    candidate_counts_by_status: toSortedObject(candidateCounts),
    review_rejection_reason_distribution: toSortedObject(rejectionReasons),
    repeated_failures: finalizeRepeatedFailures(repeatedFailures),
    preserved_item_patterns: finalizePatterns(preservedPatterns),
    probe_run_outcomes: probeRunOutcomes,
    probe_run_modes: toSortedObject(probeRunModes),
    render_mode_outcomes: toSortedStatsObject(renderModeOutcomes),
    nrt_failure_distribution: toSortedObject(nrtFailureDistribution),
    final_artifact_completion_ratio:
      finalArtifactExpectedCount === 0
        ? 0
        : finalArtifactCompletedCount / finalArtifactExpectedCount,
    session_outcomes: toSortedObject(orderedSessionOutcomes),
  };
}

export async function buildMemorySummary(
  archive: { readAll(): Promise<ArchiveRecord[]> },
  options: ArchiveMemorySummaryOptions = {},
): Promise<ArchiveMemorySummary> {
  return buildArchiveMemorySummary(await archive.readAll(), options);
}
