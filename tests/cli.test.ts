import { execSync } from 'child_process';
import { beforeAll, describe, expect, it } from 'vitest';

function runCli(command: string): { exitCode: number; stdout: string } {
  try {
    return {
      exitCode: 0,
      stdout: execSync(command).toString(),
    };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: [err.stdout?.toString?.() ?? '', err.stderr?.toString?.() ?? ''].join(''),
    };
  }
}

describe('CLI shell interface', () => {
  beforeAll(() => {
    execSync('npm run build');
  }, 15000);

  it('prints general help', () => {
    const stdout = execSync('node ./dist/cli.js --help').toString();
    expect(stdout).toContain('scctl');
    expect(stdout).toContain('status');
    expect(stdout).toContain('health');
    expect(stdout).toContain('reclaim');
  });

  it('exposes command help for eval, logs, and render', () => {
    expect(execSync('node ./dist/cli.js eval --help').toString()).toContain('Evaluate inline');
    expect(execSync('node ./dist/cli.js logs --help').toString()).toContain('--tail');
    expect(execSync('node ./dist/cli.js render --help').toString()).toContain('--duration');
  });

  it('returns structured JSON from check', () => {
    const { stdout } = runCli('node ./dist/cli.js check');
    const result = JSON.parse(stdout);

    expect(result).toMatchObject({
      success: expect.any(Boolean),
      state: expect.any(String),
      phase: 'check',
      summary: expect.any(String),
      raw_output: expect.any(String),
    });
  });

  it('returns structured JSON from status', () => {
    const { stdout } = runCli('node ./dist/cli.js status');
    const result = JSON.parse(stdout);

    expect(result.phase).toBe('status');
    expect(result.state).toMatch(/idle|stopped|degraded|engine_missing/);
  });

  it('fails run with a structured invalid_argument result for missing files', () => {
    const { exitCode, stdout } = runCli('node ./dist/cli.js run ./does-not-exist.scd');
    const result = JSON.parse(stdout);

    expect(exitCode).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('invalid_argument');
  });
});
