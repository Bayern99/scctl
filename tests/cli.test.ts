import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BASE_TRANSPORTS, WORKFLOW_TRANSPORTS } from './workflow/transport-contracts.js';

const CLI_LOADER = path.resolve(process.cwd(), 'tests/workflow/memory-summary-loader.mjs');

function parseJsonOutput(stdout: string) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Expected JSON output, got: ${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function runCli(
  command: string,
  envExtras: NodeJS.ProcessEnv = {},
): { exitCode: number; stdout: string } {
  const archiveRoot = path.join(os.tmpdir(), `scctl-cli-tests-${Date.now()}-${Math.random()}`);

  try {
    return {
      exitCode: 0,
      stdout: execSync(
        `node --loader "${CLI_LOADER}" ./dist/cli.js ${command}`,
        {
          env: {
            ...process.env,
            NODE_NO_WARNINGS: '1',
            SCCTL_ARCHIVE_ROOT: archiveRoot,
            ...envExtras,
          },
        },
      ).toString(),
    };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: [err.stdout?.toString?.() ?? '', err.stderr?.toString?.() ?? ''].join(''),
    };
  }
}

describe('CLI shell interface', () => {
  it('prints general help', () => {
    const { stdout } = runCli('--help');
    expect(stdout).toContain('scctl');
    for (const command of [...BASE_TRANSPORTS.cli, ...WORKFLOW_TRANSPORTS.map((entry) => entry.cli)]) {
      expect(stdout).toContain(command);
    }
  });

  it('exposes command help for eval, logs, and render', () => {
    expect(runCli('eval --help').stdout).toContain('Evaluate inline');
    expect(runCli('logs --help').stdout).toContain('--tail');
    expect(runCli('render --help').stdout).toContain('--duration');
    expect(runCli('render --help').stdout).toContain('--task-tag');
    expect(runCli('render-nrt --help').stdout).toContain('--sample-format');
    expect(runCli('run --help').stdout).toContain('--task-tag');
  });

  it('exposes workflow-surface commands in help output', () => {
    for (const command of WORKFLOW_TRANSPORTS.map((entry) => entry.cli)) {
      const { stdout } = runCli(`${command} --help`);
      expect(stdout).toContain(command);
    }
  });

  it('returns structured JSON from check', () => {
    const { stdout } = runCli('check');
    const result = parseJsonOutput(stdout);

    expect(result).toMatchObject({
      success: expect.any(Boolean),
      state: expect.any(String),
      phase: 'check',
      summary: expect.any(String),
      raw_output: expect.any(String),
    });
  });

  it('returns structured JSON from status', () => {
    const { stdout } = runCli('status');
    const result = parseJsonOutput(stdout);

    expect(result.phase).toBe('status');
    expect(result.state).toMatch(/idle|stopped|degraded|engine_missing/);
  });

  it('fails run with a structured invalid_argument result for missing files', () => {
    const { exitCode, stdout } = runCli('run ./does-not-exist.scd');
    const result = parseJsonOutput(stdout);

    expect(exitCode).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('invalid_argument');
    expect(result.summary).toContain('File not found: ./does-not-exist.scd');
    expect(result.compliance).toMatchObject({
      status: 'not_applicable',
      used_pilot: true,
      route: {
        action: 'run',
        surface: 'cli',
      },
    });
  });

  it('reports compliance failures for render tasks that do not produce artifacts', () => {
    const { exitCode, stdout } = runCli(
      'render ./does-not-exist.scd -o /tmp/missing.wav --task-tag sc-audio-generation',
    );
    const result = parseJsonOutput(stdout);

    expect(exitCode).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('invalid_argument');
    expect(result.summary).toContain('File not found: ./does-not-exist.scd');
    expect(result.compliance).toMatchObject({
      status: 'failed',
      task_tag: 'sc-audio-generation',
      requires_render_artifact: true,
      requires_source: true,
      route: {
        action: 'render',
        surface: 'cli',
        source_kind: 'scd_file',
      },
      used_pilot: true,
    });
  });

  it('returns structured invalid_argument JSON for bad NRT render input', () => {
    const { exitCode, stdout } = runCli(
      'render-nrt ./does-not-exist.scd -o /tmp/missing-nrt.wav --task-tag sc-audio-generation',
    );
    const result = parseJsonOutput(stdout);

    expect(exitCode).toBe(1);
    expect(result.success).toBe(false);
    expect(result.error_kind).toBe('invalid_argument');
    expect(result.compliance.route.action).toBe('render_nrt');
  });

  it('returns a wrapped workflow plan result from plan-workflow', () => {
    const { stdout } = runCli(
      `plan-workflow --context '${JSON.stringify({ task_label: 'sc-probe', requested_outcome: 'explore' })}'`,
    );
    const result = parseJsonOutput(stdout);

    expect(result).toMatchObject({
      success: true,
      action: 'plan_workflow',
      error_kind: null,
      archive_root: expect.any(String),
      payload: {
        selection: {
          workflow: 'probe',
          recommended_tools: expect.any(Array),
          primary_role: expect.any(String),
        },
        planner_system_prompt: expect.any(String),
        path_expectation: {
          allowed_steps: expect.any(Array),
          required_steps: expect.any(Array),
        },
      },
    });
  });

  it('returns a governed handoff payload from prepare-handoff', () => {
    const { stdout } = runCli(
      `prepare-handoff --input '${JSON.stringify({
        task_id: 'task-cli-handoff',
        task_tag: 'sc-probe',
        goal: 'Explore a governed probe',
        requested_outcome: 'explore',
      })}'`,
    );
    const result = parseJsonOutput(stdout);

    expect(result).toMatchObject({
      success: true,
      action: 'prepare_handoff',
      error_kind: null,
      payload: {
        task: {
          task_id: 'task-cli-handoff',
          task_tag: 'sc-probe',
        },
        workflow_plan: {
          selection: {
            workflow: 'probe',
          },
        },
        role_packets: {
          builder: {
            allowed_tools: ['sc_run_probe'],
          },
        },
      },
    });
  });

  it('returns structured invalid_argument JSON from run-probe for invalid specs', () => {
    const { exitCode, stdout } = runCli(
      `run-probe --spec '${JSON.stringify({
        id: 'probe-bad',
        title: 'Bad probe',
        question: 'Missing eval code should fail before driver execution.',
        mode: 'eval',
        tags: ['sc-probe'],
      })}'`,
    );
    const result = parseJsonOutput(stdout);

    expect(exitCode).toBe(1);
    expect(result).toMatchObject({
      success: false,
      action: 'run_probe',
      error_kind: 'invalid_argument',
      issues: expect.any(Array),
    });
  });

  it('routes summarize-session, candidate-action, and memory-summary through structured workflow JSON', () => {
    const summarize = parseJsonOutput(
      runCli(
        `summarize-session --input '${JSON.stringify({
          session_id: 'session-cli-1',
          task: 'Primitive probe review',
          outcome: 'mixed',
          preserved_items: ['cand-1'],
          failures: ['noisy tail'],
          notes: ['rerun'],
        })}'`,
      ).stdout,
    );
    expect(summarize).toMatchObject({
      success: true,
      action: 'summarize_session',
      payload: {
        record_id: expect.any(String),
        summary: {
          session_id: 'session-cli-1',
          task: 'Primitive probe review',
          outcome: 'mixed',
        },
      },
    });

    const candidate = parseJsonOutput(
      runCli(
        `candidate-action --input '${JSON.stringify({
          session_id: 'session-cli-1',
          action: 'create_draft',
          candidate_id: 'cand-cli-1',
          name: 'metal-bloom',
          source_probe_id: 'probe-cli-1',
          artifacts: [{ kind: 'render', path: '/tmp/a.wav', bytes: 12 }],
          metadata: { family: 'metal' },
        })}'`,
      ).stdout,
    );
    expect(candidate).toMatchObject({
      success: true,
      action: 'candidate_action',
      payload: {
        candidate: {
          id: 'cand-cli-1',
          status: 'draft',
          history: expect.any(Array),
        },
      },
    });

    const memory = parseJsonOutput(runCli('memory-summary --limit 3').stdout);
    expect(memory).toMatchObject({
      success: true,
      action: 'memory_summary',
      payload: {
        memory_summary: {
          records_considered: 3,
          recent_sessions: expect.any(Array),
          probe_run_outcomes: {
            total: expect.any(Number),
            success: expect.any(Number),
            failure: expect.any(Number),
          },
        },
      },
    });
  });

  it('returns a structured invalid result from audit-session when no trace exists', () => {
    const { exitCode, stdout } = runCli(
      `audit-session --input '${JSON.stringify({
        session_id: 'missing-cli-session',
        task_tag: 'sc-probe',
      })}'`,
    );
    const result = parseJsonOutput(stdout);

    expect(exitCode).toBe(1);
    expect(result).toMatchObject({
      success: false,
      action: 'audit_session',
      error_kind: 'invalid_argument',
      payload: {
        session_audit: {
          session_id: 'missing-cli-session',
          recommended_next_step: 'retry',
        },
      },
    });
  });

  it('blocks raw eval when SCCTL_GOVERNED_ROLE=builder', () => {
    const { exitCode, stdout } = runCli('eval "1+1"', {
      SCCTL_GOVERNED_ROLE: 'builder',
    });
    const result = parseJsonOutput(stdout);

    expect(exitCode).toBe(1);
    expect(result.error_kind).toBe('governance_violation');
    expect(result.role).toBe('builder');
    expect(result.tool).toBe('sc_eval');
    expect(result.allowed_tools).toContain('sc_run_probe');
    expect(result.forbidden_paths).toContain('sc_eval');
    expect(result.summary).toContain('Governed role "builder"');
    expect(result.summary).toContain('sc_eval');
  });

  it('blocks builder workflow mutations while allowing governed probe execution', () => {
    const blocked = parseJsonOutput(
      runCli(
        `candidate-action --input '${JSON.stringify({
          session_id: 'session-builder-1',
          action: 'create_draft',
          candidate_id: 'cand-builder-1',
          name: 'blocked',
          source_probe_id: 'probe-builder-1',
        })}'`,
        { SCCTL_GOVERNED_ROLE: 'builder' },
      ).stdout,
    );
    expect(blocked.error_kind).toBe('governance_violation');
    expect(blocked.tool).toBe('sc_candidate_action');

    const allowed = parseJsonOutput(
      runCli(
        `run-probe --spec '${JSON.stringify({
          id: 'probe-builder-1',
          title: 'Builder probe',
          question: 'Missing code should fail after governance allows the tool.',
          mode: 'eval',
          tags: ['sc-probe'],
        })}'`,
        { SCCTL_GOVERNED_ROLE: 'builder' },
      ).stdout,
    );
    expect(allowed.error_kind).toBe('invalid_argument');
    expect(allowed.summary).not.toContain('governance_violation');
  });

  it('allows manager handoff tools but rejects execution tools', () => {
    const allowed = parseJsonOutput(
      runCli(
        `prepare-handoff --input '${JSON.stringify({
          task_id: 'task-manager-1',
          task_tag: 'sc-probe',
          goal: 'Prepare governed loop',
          requested_outcome: 'explore',
        })}'`,
        { SCCTL_GOVERNED_ROLE: 'manager' },
      ).stdout,
    );
    expect(allowed.success).toBe(true);
    expect(allowed.action).toBe('prepare_handoff');

    const blocked = parseJsonOutput(
      runCli(
        `run-probe --spec '${JSON.stringify({
          id: 'probe-manager-1',
          title: 'Manager probe',
          question: 'Managers should not execute.',
          mode: 'eval',
          code: '{ SinOsc.ar(440) }.play;',
          tags: ['sc-probe'],
        })}'`,
        { SCCTL_GOVERNED_ROLE: 'manager' },
      ).stdout,
    );
    expect(blocked.error_kind).toBe('governance_violation');
    expect(blocked.tool).toBe('sc_run_probe');
  });

  it('allows critic audit tools but rejects execution tools', () => {
    const allowed = parseJsonOutput(
      runCli(
        `audit-session --input '${JSON.stringify({
          session_id: 'missing-critic-session',
          task_tag: 'sc-probe',
        })}'`,
        { SCCTL_GOVERNED_ROLE: 'critic' },
      ).stdout,
    );
    expect(allowed.error_kind).toBe('invalid_argument');
    expect(allowed.summary).not.toContain('governance_violation');

    const blocked = parseJsonOutput(
      runCli(
        `run-probe --spec '${JSON.stringify({
          id: 'probe-critic-1',
          title: 'Critic probe',
          question: 'Critics should not execute.',
          mode: 'eval',
          code: '{ SinOsc.ar(330) }.play;',
          tags: ['sc-probe'],
        })}'`,
        { SCCTL_GOVERNED_ROLE: 'critic' },
      ).stdout,
    );
    expect(blocked.error_kind).toBe('governance_violation');
    expect(blocked.tool).toBe('sc_run_probe');
  });
});
