import type { ArchiveMemorySummaryOptions } from '../archive/archive-types.js';
import type { ScQualitySpec } from '../planner/sc-spec-schema.js';
import type { PlanWorkflowPayload } from '../workflow/service.js';

export type OrchestrationAction = 'prepare_handoff' | 'audit_session';

export type OrchestrationErrorKind = 'invalid_argument' | 'not_found' | 'workflow_failed';

export interface OrchestrationSuccessResult<TPayload> {
  success: true;
  action: OrchestrationAction;
  summary: string;
  error_kind: null;
  archive_root: string;
  payload: TPayload;
}

export interface OrchestrationErrorResult<TPayload = never> {
  success: false;
  action: OrchestrationAction;
  summary: string;
  error_kind: OrchestrationErrorKind;
  archive_root: string;
  payload?: TPayload;
  issues?: string[];
}

export type OrchestrationResult<TPayload> =
  | OrchestrationSuccessResult<TPayload>
  | OrchestrationErrorResult<TPayload>;

export type TaskRequestedOutcome = 'explore' | 'refine' | 'review' | 'promote';

export interface TaskEnvelope {
  task_id: string;
  task_tag: string;
  goal: string;
  requested_outcome: TaskRequestedOutcome;
  spec?: unknown;
  quality?: ScQualitySpec;
  constraints?: string[];
  memory_options?: ArchiveMemorySummaryOptions;
}

export type RoleName = 'manager' | 'builder' | 'critic';

export interface RolePacket {
  role: RoleName;
  objective: string;
  allowed_tools: string[];
  forbidden_paths: string[];
  required_outputs: string[];
  completion_gates: string[];
}

export interface KbSnapshot {
  project_rules: string[];
  render_checklist: string[];
  evaluation_rubric: string[];
  known_failures: string[];
  allowed_primitives: string[];
  memory_summary_excerpt?: string[];
}

export interface PrepareHandoffPayload {
  task: TaskEnvelope;
  workflow_plan: PlanWorkflowPayload;
  kb_snapshot: KbSnapshot;
  role_packets: {
    manager: RolePacket;
    builder: RolePacket;
    critic: RolePacket;
  };
  recommended_loop: string[];
}

export type AuditStatus = 'pass' | 'warn' | 'fail';

export interface AuditCheck {
  status: AuditStatus;
  summary: string;
  details: string[];
}

export interface SessionAudit {
  session_id: string;
  task_tag: string | null;
  path_compliance: AuditCheck & {
    workflow: string;
    steps: string[];
    missing_required_steps: string[];
    disallowed_steps: string[];
    compliance_rate: number;
  };
  artifact_completion: AuditCheck & {
    render_artifact_required: boolean;
    render_artifact_present: boolean;
    render_artifact_count: number;
    draft_artifact_count: number;
    nrt_artifact_count: number;
    matching_required_mode_present: boolean;
    required_render_mode: 'draft' | 'nrt' | null;
  };
  summary_present: AuditCheck & {
    present: boolean;
    record_count: number;
  };
  review_gate: AuditCheck & {
    required: boolean;
    present: boolean;
    verdicts: string[];
  };
  candidate_state: {
    candidate_ids: string[];
    primary_candidate_id: string | null;
    status: string | null;
    review_count: number;
    latest_review_verdict: string | null;
  };
  recommended_next_step: 'retry' | 'revise' | 'promote' | 'accept' | 'reject' | 'archive';
  issues: string[];
}

export interface AuditSessionInput {
  session_id: string;
  task_tag?: string;
  candidate_id?: string;
  quality?: ScQualitySpec;
}

export interface AuditSessionPayload {
  session_audit: SessionAudit;
  records_considered: number;
}
