import { promises as fs } from 'fs';
import path from 'path';
import type { ArchiveMemorySummary } from '../archive/archive-types.js';
import type { KbSnapshot } from './orchestration-types.js';

const KB_FILES = {
  project_rules: 'project-rules.md',
  render_checklist: 'render-checklist.md',
  evaluation_rubric: 'evaluation-rubric.md',
  known_failures: 'known-failures.md',
  allowed_primitives: 'allowed-primitives.md',
} as const;

export function resolveKbRoot(cwd = process.cwd()): string {
  return path.resolve(cwd, 'docs/superpowers/kb');
}

export async function loadKbSnapshot(
  kbRoot: string,
  memorySummary?: ArchiveMemorySummary | null,
): Promise<KbSnapshot> {
  const [
    projectRules,
    renderChecklist,
    evaluationRubric,
    knownFailures,
    allowedPrimitives,
  ] = await Promise.all([
    readKbList(path.join(kbRoot, KB_FILES.project_rules)),
    readKbList(path.join(kbRoot, KB_FILES.render_checklist)),
    readKbList(path.join(kbRoot, KB_FILES.evaluation_rubric)),
    readKbList(path.join(kbRoot, KB_FILES.known_failures)),
    readKbList(path.join(kbRoot, KB_FILES.allowed_primitives)),
  ]);

  const memorySummaryExcerpt = buildMemorySummaryExcerpt(memorySummary);

  return {
    project_rules: projectRules,
    render_checklist: renderChecklist,
    evaluation_rubric: evaluationRubric,
    known_failures: knownFailures,
    allowed_primitives: allowedPrimitives,
    ...(memorySummaryExcerpt ? { memory_summary_excerpt: memorySummaryExcerpt } : {}),
  };
}

async function readKbList(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return parseMarkdownList(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }

    throw err;
  }
}

function parseMarkdownList(content: string): string[] {
  const lines = content.split('\n');
  const items: string[] = [];
  let inFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.startsWith('#') || line.startsWith('>')) {
      continue;
    }

    const normalized = line
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim();

    if (normalized) {
      items.push(normalized);
    }
  }

  return items;
}

function buildMemorySummaryExcerpt(
  memorySummary?: ArchiveMemorySummary | null,
): string[] | undefined {
  if (!memorySummary || memorySummary.records_considered === 0) {
    return undefined;
  }

  const lines: string[] = [];
  lines.push(`Records considered: ${memorySummary.records_considered}.`);

  if (memorySummary.recent_sessions.length > 0) {
    const sessions = memorySummary.recent_sessions
      .slice(0, 3)
      .map((session) => `${session.session_id} (${session.record_count} records)`);
    lines.push(`Recent sessions: ${sessions.join(', ')}.`);
  }

  const candidateStatuses = Object.entries(memorySummary.candidate_counts_by_status)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}=${count}`);
  if (candidateStatuses.length > 0) {
    lines.push(`Candidate states: ${candidateStatuses.join(', ')}.`);
  }

  if (memorySummary.repeated_failures.length > 0) {
    const repeated = memorySummary.repeated_failures
      .slice(0, 3)
      .map((failure) => `${failure.failure} (${failure.count})`);
    lines.push(`Repeated failures: ${repeated.join(', ')}.`);
  }

  if (memorySummary.preserved_item_patterns.length > 0) {
    const patterns = memorySummary.preserved_item_patterns
      .slice(0, 3)
      .map((pattern) => `${pattern.pattern} (${pattern.count})`);
    lines.push(`Preserved patterns: ${patterns.join(', ')}.`);
  }

  return lines;
}
