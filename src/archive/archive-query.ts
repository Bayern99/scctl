import { ArchiveRecord } from './archive-types.js';

interface CandidatePayload {
  candidate_id?: unknown;
  event?: unknown;
  preserved_items?: unknown;
}

export function sortArchiveRecords(records: ArchiveRecord[]): ArchiveRecord[] {
  return [...records].sort((left, right) => {
    const createdAtCompare = right.created_at.localeCompare(left.created_at);
    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }

    return right.id.localeCompare(left.id);
  });
}

export function normalizeArchiveText(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeArchiveCandidateId(value: string | undefined): string | null {
  return normalizeArchiveText(value);
}

export function collectArchiveCandidateIds(record: ArchiveRecord): string[] {
  const payload = record.payload as CandidatePayload;
  const candidateIds = new Set<string>();

  const directCandidateId = normalizeArchiveCandidateId(
    typeof payload.candidate_id === 'string' ? payload.candidate_id : undefined,
  );
  if (directCandidateId) {
    candidateIds.add(directCandidateId);
  }

  const eventCandidateId = normalizeArchiveCandidateId(
    typeof payload.event === 'object'
      && payload.event !== null
      && typeof (payload.event as Record<string, unknown>).candidate_id === 'string'
      ? ((payload.event as Record<string, unknown>).candidate_id as string)
      : undefined,
  );
  if (eventCandidateId) {
    candidateIds.add(eventCandidateId);
  }

  if (record.kind === 'session_summary') {
    const preservedItems = Array.isArray(payload.preserved_items)
      ? (payload.preserved_items as string[])
      : [];

    for (const item of preservedItems) {
      const normalizedItem = normalizeArchiveText(item);
      if (!normalizedItem) {
        continue;
      }

      if (normalizedItem.includes(':')) {
        const [prefix, suffix] = normalizedItem.split(':', 2);
        if (prefix === 'candidate' || prefix === 'cand' || prefix === 'candidate_id') {
          const candidateId = normalizeArchiveCandidateId(suffix);
          if (candidateId) {
            candidateIds.add(candidateId);
          }
        }
      } else if (/^cand[-_]/.test(normalizedItem)) {
        candidateIds.add(normalizedItem);
      }
    }
  }

  return [...candidateIds].sort();
}

export function recordMatchesArchiveCandidate(
  record: ArchiveRecord,
  candidateId: string,
): boolean {
  return collectArchiveCandidateIds(record).includes(candidateId);
}

export function selectRecentSessionWindow(
  records: ArchiveRecord[],
  limit?: number,
): ArchiveRecord[] {
  if (
    typeof limit !== 'number'
    || !Number.isFinite(limit)
    || limit < 0
  ) {
    return records;
  }

  const sortedRecords = sortArchiveRecords(records);
  if (limit === 0) {
    return [];
  }

  const sessionIds = new Set<string>();
  for (const record of sortedRecords) {
    sessionIds.add(record.session_id);
    if (sessionIds.size >= limit) {
      break;
    }
  }

  return sortedRecords.filter((record) => sessionIds.has(record.session_id));
}
