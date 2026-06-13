import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const HOOK_SCRIPT = path.join(REPO_ROOT, 'hooks/scctl-session-start.js');

describe('scctl-session-start hook', () => {
  it('returns additional_context without governed marker', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scctl-hook-clean-'));
    fs.mkdirSync(path.join(tmpRoot, 'docs/superpowers/kb'), { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, 'docs/superpowers/kb/role-tool-policies.json'),
      path.join(tmpRoot, 'docs/superpowers/kb/role-tool-policies.json'),
    );

    const result = spawnSync('node', [HOOK_SCRIPT], {
      cwd: tmpRoot,
      input: '{}',
      encoding: 'utf8',
      env: { ...process.env, SCCTL_GOVERNED_ROLE: '' },
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.additional_context).toContain('SuperCollider Pilot');
    expect(payload.additional_context).toContain('operator/debug mode');
  });

  it('includes governed role when marker exists', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scctl-hook-'));
    const scctlDir = path.join(tmpRoot, '.scctl');
    fs.mkdirSync(scctlDir, { recursive: true });
    fs.writeFileSync(
      path.join(scctlDir, 'governed-role'),
      JSON.stringify({ final_nrt: true, task_id: 'task-hook-test', prepared_at: '2026-06-13T00:00:00.000Z' }),
    );
    fs.mkdirSync(path.join(tmpRoot, 'docs/superpowers/kb'), { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, 'docs/superpowers/kb/role-tool-policies.json'),
      path.join(tmpRoot, 'docs/superpowers/kb/role-tool-policies.json'),
    );

    const result = spawnSync('node', [HOOK_SCRIPT], {
      cwd: tmpRoot,
      input: '{}',
      encoding: 'utf8',
      env: { ...process.env, SCCTL_GOVERNED_ROLE: 'builder' },
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.additional_context).toContain('task-hook-test');
    expect(payload.additional_context).toContain('final_nrt=true');
    expect(payload.additional_context).toContain('SCCTL_GOVERNED_ROLE=builder');
  });
});
