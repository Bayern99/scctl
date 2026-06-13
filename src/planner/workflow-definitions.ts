import type { ScExecutionMode, WorkflowKind } from './sc-spec-schema.js';

export type WorkflowPrimaryRole = 'manager' | 'builder' | 'critic';

export interface WorkflowDefinitionOptions {
  finalNrtRequested?: boolean;
  reviewRequired?: boolean;
}

export interface WorkflowDefinition {
  workflow: WorkflowKind;
  primary_role: WorkflowPrimaryRole;
  recommended_execution_mode: ScExecutionMode;
  recommended_tools: string[];
  required_trace_steps: string[];
  review_gate_required: boolean;
}

export function getWorkflowDefinition(
  workflow: WorkflowKind,
  options: WorkflowDefinitionOptions = {},
): WorkflowDefinition {
  const finalNrtRequested = options.finalNrtRequested ?? false;
  const reviewRequired = options.reviewRequired ?? defaultReviewRequirement(workflow);

  if (workflow === 'probe') {
    return {
      workflow,
      primary_role: 'builder',
      recommended_execution_mode: 'eval',
      recommended_tools: [
        'sc_prepare_handoff',
        'sc_run_probe',
        'sc_summarize_session',
        'sc_audit_session',
        'sc_memory_summary',
      ],
      required_trace_steps: ['sc_run_probe', 'sc_summarize_session'],
      review_gate_required: false,
    };
  }

  if (workflow === 'patch_refinement') {
    return {
      workflow,
      primary_role: 'manager',
      recommended_execution_mode: 'run_file',
      recommended_tools: [
        'sc_prepare_handoff',
        'sc_run_probe',
        'sc_summarize_session',
        'sc_audit_session',
        'sc_memory_summary',
      ],
      required_trace_steps: ['sc_run_probe', 'sc_summarize_session'],
      review_gate_required: false,
    };
  }

  if (workflow === 'render_qa') {
    return {
      workflow,
      primary_role: 'critic',
      recommended_execution_mode: finalNrtRequested ? 'render_nrt' : 'render',
      recommended_tools: [
        'sc_prepare_handoff',
        'sc_run_probe',
        'sc_summarize_session',
        ...(reviewRequired ? ['sc_candidate_action:add_review'] : []),
        'sc_audit_session',
        'sc_memory_summary',
      ],
      required_trace_steps: reviewRequired
        ? ['sc_run_probe', 'sc_summarize_session', 'sc_candidate_action:add_review']
        : ['sc_run_probe', 'sc_summarize_session'],
      review_gate_required: reviewRequired,
    };
  }

  return {
    workflow,
    primary_role: 'critic',
    recommended_execution_mode: finalNrtRequested ? 'render_nrt' : 'render',
    recommended_tools: [
      'sc_prepare_handoff',
      'sc_summarize_session',
      'sc_candidate_action:add_review',
      'sc_candidate_action',
      'sc_audit_session',
      'sc_memory_summary',
    ],
    required_trace_steps: [
      'sc_summarize_session',
      'sc_candidate_action:add_review',
      'sc_candidate_action',
    ],
    review_gate_required: true,
  };
}

function defaultReviewRequirement(workflow: WorkflowKind): boolean {
  return workflow === 'render_qa' || workflow === 'candidate_promotion';
}
