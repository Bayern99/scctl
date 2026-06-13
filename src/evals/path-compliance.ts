import { buildSummary, type EvalIssue, type EvalMetric } from './eval-types.js';
import {
  type WorkflowKind,
  WORKFLOW_KINDS,
} from '../planner/sc-spec-schema.js';
import { getWorkflowDefinition } from '../planner/workflow-definitions.js';

export interface PathStep {
  name: string;
  kind?: 'tool' | 'artifact' | 'review' | 'recovery' | 'other';
}

export interface PathComplianceInput {
  workflow: WorkflowKind;
  steps: readonly PathStep[];
  allowedSteps?: readonly string[];
  requiredSteps?: readonly string[];
}

export interface PathComplianceResult {
  compliance_rate: number;
  missing_required_steps: string[];
  disallowed_steps: string[];
  summary: ReturnType<typeof buildSummary>;
}

export const DEFAULT_PILOT_STEPS = [
  'sc_check',
  'sc_status',
  'sc_health',
  'sc_eval',
  'sc_run_file',
  'sc_logs',
  'sc_render',
  'sc_render_nrt',
  'sc_stop',
  'sc_reset',
  'sc_reboot',
  'sc_reclaim',
  'sc_plan_workflow',
  'sc_run_probe',
  'sc_summarize_session',
  'sc_candidate_action',
  'sc_candidate_action:add_review',
  'sc_memory_summary',
  'sc_prepare_handoff',
  'sc_audit_session',
] as const;

export function isWorkflowKind(value: string): value is WorkflowKind {
  return (WORKFLOW_KINDS as readonly string[]).includes(value);
}

export function evaluatePathCompliance(
  input: PathComplianceInput,
): PathComplianceResult {
  const steps = [...input.steps];
  const allowedSteps = new Set(input.allowedSteps ?? DEFAULT_PILOT_STEPS);
  const requiredSteps = [
    ...(input.requiredSteps ?? getWorkflowDefinition(input.workflow).required_trace_steps),
  ];

  const disallowedSteps = steps
    .map((step) => step.name)
    .filter((name) => !allowedSteps.has(name));
  const presentSteps = new Set(steps.map((step) => step.name));
  const missingRequiredSteps = requiredSteps.filter((name) => !presentSteps.has(name));

  const allowedCount = steps.filter((step) => allowedSteps.has(step.name)).length;
  const complianceRate = steps.length === 0 ? 0 : allowedCount / steps.length;

  const issues: EvalIssue[] = [];
  if (steps.length === 0) {
    issues.push({
      code: 'empty_path',
      message: 'No path steps were recorded for evaluation.',
      severity: 'error',
    });
  }
  if (disallowedSteps.length > 0) {
    issues.push({
      code: 'disallowed_step',
      message: `Path used disallowed steps: ${disallowedSteps.join(', ')}`,
      severity: 'error',
    });
  }
  if (missingRequiredSteps.length > 0) {
    issues.push({
      code: 'missing_required_step',
      message: `Path skipped required steps: ${missingRequiredSteps.join(', ')}`,
      severity: 'warn',
    });
  }

  const metrics: EvalMetric[] = [
    {
      name: 'pilot_path_compliance_rate',
      value: complianceRate,
      weight: 3,
      details: `Allowed ${allowedCount} of ${steps.length} recorded steps.`,
    },
    {
      name: 'required_step_coverage',
      value:
        requiredSteps.length === 0
          ? 1
          : (requiredSteps.length - missingRequiredSteps.length) / requiredSteps.length,
      weight: 2,
      details: `Covered ${requiredSteps.length - missingRequiredSteps.length} of ${requiredSteps.length} required steps.`,
    },
  ];

  return {
    compliance_rate: complianceRate,
    missing_required_steps: missingRequiredSteps,
    disallowed_steps: disallowedSteps,
    summary: buildSummary({
      evaluator: 'path_compliance',
      metrics,
      issues,
      signals: [
        {
          name: 'workflow',
          status: 'neutral',
          details: input.workflow,
        },
      ],
      notes: [
        'Measures whether a task stayed on the intended Pilot-oriented execution path.',
      ],
    }),
  };
}
