import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const AUDIT_SCRIPT = path.join(REPO_ROOT, 'scripts/harness-audit.js');

function runAudit(scope: string) {
  const result = spawnSync('node', [AUDIT_SCRIPT, scope, '--format', 'json', '--root', REPO_ROOT], {
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as {
    scope: string;
    overall_score: number;
    max_score: number;
    categories: Array<{ name: string; score: number; max: number }>;
  };
}

describe('harness-audit skills scope', () => {
  it('passes Project Skills category at full score', () => {
    const report = runAudit('skills');
    expect(report.scope).toBe('skills');
    const skills = report.categories.find((c) => c.name === 'Project Skills');
    expect(skills).toBeDefined();
    expect(skills!.score).toBe(skills!.max);
  });

  it('passes Hooks scope checks', () => {
    const report = runAudit('hooks');
    const hooks = report.categories.find((c) => c.name === 'Hooks');
    expect(hooks).toBeDefined();
    expect(hooks!.score).toBe(hooks!.max);
  });
});
