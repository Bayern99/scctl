import { ArchiveRecord } from '../archive/archive-types.js';
import { ArchiveStore } from '../archive/archive-store.js';
import { collectArchiveCandidateIds } from '../archive/archive-query.js';
import { getTaskPolicy } from '../harness/policies.js';
import { normalizeTaskTag } from '../harness/task-tags.js';
import { getRoleToolPolicy } from '../harness/role-policies.js';
import { writeGovernedSessionMarker } from '../harness/governed-session-marker.js';
import { CandidateRegistry } from '../lab/candidate-registry.js';
import type {
  CandidateLifecycleAction,
  CandidateReviewNote,
  CandidateStatus,
  PrimitiveCandidate,
  ProbeArtifactRef,
  ProbeRunResult,
} from '../lab/lab-types.js';
import { evaluatePathCompliance } from '../evals/path-compliance.js';
import { loadKbSnapshot, resolveKbRoot } from './kb-loader.js';
import {
  AuditCheck,
  AuditSessionInput,
  AuditSessionPayload,
  KbSnapshot,
  OrchestrationAction,
  OrchestrationErrorKind,
  OrchestrationErrorResult,
  OrchestrationResult,
  OrchestrationSuccessResult,
  PrepareHandoffPayload,
  RolePacket,
  SessionAudit,
  TaskEnvelope,
} from './orchestration-types.js';
import { selectWorkflow, WorkflowSelectionInput } from '../planner/workflow-selector.js';
import { getWorkflowDefinition } from '../planner/workflow-definitions.js';
import { WorkflowService } from '../workflow/service.js';

interface OrchestrationServiceOptions {
  archiveRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  kbRoot?: string;
  workflowService?: WorkflowService;
}

interface ProbeRunArchivePayload {
  spec?: {
    mode?: 'eval' | 'run_file' | 'render' | 'render_nrt';
  };
  result?: ProbeRunResult;
}

interface CandidateLifecyclePayload {
  candidate_id?: string;
  event?: {
    action?: CandidateLifecycleAction;
    to_status?: CandidateStatus;
  };
}

interface CandidateReviewPayload {
  candidate_id?: string;
  review?: CandidateReviewNote;
}

interface SessionSummaryPayload {
  outcome?: 'success' | 'failure' | 'mixed';
  preserved_items?: string[];
}

const GOVERNED_ALLOWED_STEPS = [
  'sc_prepare_handoff',
  'sc_run_probe',
  'sc_summarize_session',
  'sc_candidate_action',
  'sc_candidate_action:add_review',
  'sc_memory_summary',
  'sc_audit_session',
];

const RECOMMENDED_LOOP = [
  'prepare_handoff',
  'run_probe',
  'summarize_session',
  'add_review / candidate_action',
  'audit_session',
  'memory_summary',
];

export class OrchestrationService {
  private readonly workflowService: WorkflowService;
  private readonly archive: ArchiveStore;
  private readonly kbRoot: string;

  constructor(options: OrchestrationServiceOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    this.workflowService =
      options.workflowService
      ?? new WorkflowService({
        archiveRoot: options.archiveRoot,
        cwd,
        env: options.env,
      });
    this.archive = new ArchiveStore(options.archiveRoot ?? this.workflowService.getArchiveRoot());
    this.kbRoot = options.kbRoot ?? resolveKbRoot(cwd);
  }

  public getArchiveRoot(): string {
    return this.workflowService.getArchiveRoot();
  }

  public getKbRoot(): string {
    return this.kbRoot;
  }

  public async prepareHandoff(
    input: TaskEnvelope,
  ): Promise<OrchestrationResult<PrepareHandoffPayload>> {
    const validationIssues = validateTaskEnvelope(input);
    if (validationIssues.length > 0) {
      return this.error(
        'prepare_handoff',
        'invalid_argument',
        'Task envelope validation failed.',
        undefined,
        validationIssues,
      );
    }

    const normalizedTaskTag = normalizeTaskTag(input.task_tag)!;
    const workflowPlan = await this.workflowService.planWorkflow({
      spec: input.spec,
      context: buildWorkflowContext(input, normalizedTaskTag),
    });

    if (!workflowPlan.success) {
      return this.error(
        'prepare_handoff',
        workflowPlan.error_kind,
        workflowPlan.summary,
        undefined,
        workflowPlan.issues,
      );
    }

    const memorySummary = await this.workflowService.memorySummaryCommand(
      input.memory_options ?? {},
    );
    if (!memorySummary.success) {
      return this.error(
        'prepare_handoff',
        memorySummary.error_kind,
        memorySummary.summary,
        undefined,
        memorySummary.issues,
      );
    }

    const kbSnapshot = await loadKbSnapshot(
      this.kbRoot,
      memorySummary.payload.memory_summary,
    );
    const rolePackets = buildRolePackets(input, workflowPlan.payload, normalizedTaskTag);

    writeGovernedSessionMarker(process.cwd(), {
      final_nrt: finalNrtRequestedFromPlan(workflowPlan.payload, input),
      task_id: input.task_id,
    });

    return this.success('prepare_handoff', 'Governed handoff prepared.', {
      task: {
        ...input,
        task_tag: normalizedTaskTag,
        constraints: [...(input.constraints ?? [])],
      },
      workflow_plan: workflowPlan.payload,
      kb_snapshot: kbSnapshot,
      role_packets: rolePackets,
      recommended_loop: RECOMMENDED_LOOP,
    });
  }

  public async auditSession(
    input: AuditSessionInput,
  ): Promise<OrchestrationResult<AuditSessionPayload>> {
    const issues = validateAuditInput(input);
    if (issues.length > 0) {
      return this.error(
        'audit_session',
        'invalid_argument',
        'Session audit input validation failed.',
        undefined,
        issues,
      );
    }

    const normalizedTaskTag = normalizeTaskTag(input.task_tag) ?? null;
    const records = await this.archive.listBySession(input.session_id);
    const sessionAudit = await this.buildSessionAudit(
      input.session_id,
      records,
      normalizedTaskTag,
      input.candidate_id,
      input.quality,
    );

    const payload: AuditSessionPayload = {
      session_audit: sessionAudit,
      records_considered: records.length,
    };

    if (records.length === 0) {
      return this.error(
        'audit_session',
        'invalid_argument',
        'No archive records were found for this session.',
        payload,
        ['session_id has no recorded archive events.'],
      );
    }

    await this.archive.append({
      kind: 'session_audit',
      session_id: input.session_id,
      payload: {
        session_audit: sessionAudit,
        records_considered: records.length,
        task_tag: normalizedTaskTag,
      },
    });

    return this.success('audit_session', 'Session audit prepared.', payload);
  }

  private async buildSessionAudit(
    sessionId: string,
    records: ArchiveRecord[],
    taskTag: ReturnType<typeof normalizeTaskTag>,
    requestedCandidateId?: string,
    quality?: TaskEnvelope['quality'],
  ): Promise<SessionAudit> {
    const candidateIds = collectSessionCandidateIds(records);
    const primaryCandidateId = requestedCandidateId ?? candidateIds[0] ?? null;
    const inferredQualityTier =
      quality?.render_tier ?? inferQualityTierFromRecords(records);
    const selection = selectWorkflow(
      inferSelectionInput(records, taskTag, primaryCandidateId, inferredQualityTier),
    );
    const taskPolicy = getTaskPolicy(taskTag);
    const reviewRequired =
      taskPolicy?.requires_review_note
      || selection.workflow === 'candidate_promotion';
    const workflowDefinition = getWorkflowDefinition(selection.workflow, {
      finalNrtRequested: inferredQualityTier === 'final_nrt',
      reviewRequired,
    });
    const steps = records.flatMap((record) => recordToGovernedSteps(record));
    const pathResult = evaluatePathCompliance({
      workflow: selection.workflow,
      steps,
      allowedSteps: GOVERNED_ALLOWED_STEPS,
      requiredSteps: [...workflowDefinition.required_trace_steps],
    });

    const probeRuns = records
      .filter((record) => record.kind === 'probe_run')
      .map((record) => (record.payload as ProbeRunArchivePayload).result)
      .filter((result): result is ProbeRunResult => Boolean(result));
    const summaryRecords = records.filter((record) => record.kind === 'session_summary');
    const reviewRecords = records
      .filter((record) => record.kind === 'review_note')
      .map((record) => (record.payload as CandidateReviewPayload).review)
      .filter((review): review is CandidateReviewNote => Boolean(review));
    const candidateSnapshots = await this.loadCandidateSnapshots(candidateIds, primaryCandidateId);
    const primaryCandidate = candidateSnapshots.primary;

    const renderArtifacts = probeRuns.flatMap((probe) => probe.artifacts).filter(isRenderArtifactRef);
    const summaryPresent = summaryRecords.length > 0;
    const reviewPresent = reviewRecords.length > 0;
    const latestReviewVerdict =
      primaryCandidate?.reviews.at(-1)?.verdict
      ?? reviewRecords.at(-1)?.verdict
      ?? null;

    const pathCompliance = buildPathCheck(selection.workflow, steps, pathResult);
    const artifactCompletion = buildArtifactCheck(
      taskTag,
      selection.workflow,
      renderArtifacts,
      inferredQualityTier === 'final_nrt' ? 'nrt' : null,
    );
    const summaryCheck = buildSummaryCheck(summaryPresent, summaryRecords.length);
    const reviewGate = buildReviewGateCheck(reviewRequired, reviewPresent, reviewRecords);

    const auditIssues = new Set<string>();
    for (const issue of pathResult.summary.issues) {
      auditIssues.add(issue.message);
    }
    if (!summaryPresent) {
      auditIssues.add('No session_summary record is present for this session.');
    }
    if (artifactCompletion.status === 'fail') {
      auditIssues.add(artifactCompletion.summary);
    }
    if (reviewRequired && !reviewPresent) {
      auditIssues.add('Review gate is required but no explicit review note was recorded.');
    }
    if (primaryCandidateId && !primaryCandidate) {
      auditIssues.add(`Candidate ${primaryCandidateId} was referenced but no snapshot could be reconstructed.`);
    }

    return {
      session_id: sessionId,
      task_tag: taskTag,
      path_compliance: pathCompliance,
      artifact_completion: artifactCompletion,
      summary_present: summaryCheck,
      review_gate: reviewGate,
      candidate_state: {
        candidate_ids: candidateIds,
        primary_candidate_id: primaryCandidateId,
        status: primaryCandidate?.status ?? null,
        review_count: primaryCandidate?.reviews.length ?? reviewRecords.length,
        latest_review_verdict: latestReviewVerdict,
      },
      recommended_next_step: recommendNextStep({
        hasRecords: records.length > 0,
        hasSuccessfulProbe: probeRuns.some((probe) => probe.success),
        pathStatus: pathCompliance.status,
        artifactStatus: artifactCompletion.status,
        summaryPresent,
        reviewRequired,
        reviewPresent,
        candidateStatus: primaryCandidate?.status ?? null,
        latestReviewVerdict,
      }),
      issues: [...auditIssues],
    };
  }

  private async loadCandidateSnapshots(
    candidateIds: string[],
    primaryCandidateId: string | null,
  ): Promise<{
    all: PrimitiveCandidate[];
    primary: PrimitiveCandidate | null;
  }> {
    if (candidateIds.length === 0 && !primaryCandidateId) {
      return { all: [], primary: null };
    }

    const registry = new CandidateRegistry(this.archive);
    const allCandidates = await registry.listCandidates();
    const matched = allCandidates.filter((candidate) =>
      candidateIds.includes(candidate.id) || candidate.id === primaryCandidateId,
    );

    return {
      all: matched,
      primary: matched.find((candidate) => candidate.id === primaryCandidateId) ?? null,
    };
  }

  private success<TPayload>(
    action: OrchestrationAction,
    summary: string,
    payload: TPayload,
  ): OrchestrationSuccessResult<TPayload> {
    return {
      success: true,
      action,
      summary,
      error_kind: null,
      archive_root: this.getArchiveRoot(),
      payload,
    };
  }

  private error<TPayload>(
    action: OrchestrationAction,
    errorKind: OrchestrationErrorKind,
    summary: string,
    payload?: TPayload,
    issues?: string[],
  ): OrchestrationErrorResult<TPayload> {
    return {
      success: false,
      action,
      summary,
      error_kind: errorKind,
      archive_root: this.getArchiveRoot(),
      payload,
      issues,
    };
  }
}

function validateTaskEnvelope(input: TaskEnvelope): string[] {
  const issues: string[] = [];

  if (!isNonEmptyString(input.task_id)) {
    issues.push('task_id is required.');
  }
  if (!isNonEmptyString(input.goal)) {
    issues.push('goal is required.');
  }
  if (!normalizeTaskTag(input.task_tag)) {
    issues.push('task_tag must be one of sc-audio-generation, sc-probe, or sc-render-review.');
  }
  if (!['explore', 'refine', 'review', 'promote'].includes(input.requested_outcome)) {
    issues.push('requested_outcome must be one of explore, refine, review, or promote.');
  }
  if (typeof input.constraints !== 'undefined' && !isStringArray(input.constraints)) {
    issues.push('constraints must be an array of non-empty strings when present.');
  }
  if (
    typeof input.memory_options !== 'undefined'
    && !isPlainObject(input.memory_options)
  ) {
    issues.push('memory_options must be an object when present.');
  }
  if (typeof input.quality !== 'undefined' && !isValidQualityInput(input.quality)) {
    issues.push('quality must contain only render_tier, engine_preference, and sample_format when present.');
  }

  return issues;
}

function validateAuditInput(input: AuditSessionInput): string[] {
  const issues: string[] = [];

  if (!isNonEmptyString(input.session_id)) {
    issues.push('session_id is required.');
  }
  if (typeof input.task_tag !== 'undefined' && !normalizeTaskTag(input.task_tag)) {
    issues.push('task_tag must be one of sc-audio-generation, sc-probe, or sc-render-review when present.');
  }
  if (typeof input.candidate_id !== 'undefined' && !isNonEmptyString(input.candidate_id)) {
    issues.push('candidate_id must be a non-empty string when present.');
  }
  if (typeof input.quality !== 'undefined' && !isValidQualityInput(input.quality)) {
    issues.push('quality must contain only render_tier, engine_preference, and sample_format when present.');
  }

  return issues;
}

function buildWorkflowContext(
  task: TaskEnvelope,
  taskTag: ReturnType<typeof normalizeTaskTag>,
): WorkflowSelectionInput {
  const taskPolicy = getTaskPolicy(taskTag);
  return {
    task_label: taskTag ?? undefined,
    requested_outcome: task.requested_outcome,
    has_candidate: task.requested_outcome === 'promote',
    has_render_artifact: taskTag === 'sc-render-review',
    requires_review:
      taskPolicy?.requires_review_note
      || task.requested_outcome === 'promote',
    quality_tier: task.quality?.render_tier,
  };
}

function finalNrtRequestedFromPlan(
  workflowPlan: PrepareHandoffPayload['workflow_plan'],
  task: TaskEnvelope,
): boolean {
  return (
    task.quality?.render_tier === 'final_nrt'
    || workflowPlan.selection.recommended_execution_mode === 'render_nrt'
  );
}

function buildRolePackets(
  task: TaskEnvelope,
  workflowPlan: PrepareHandoffPayload['workflow_plan'],
  taskTag: string,
): PrepareHandoffPayload['role_packets'] {
  const workflow = workflowPlan.selection.workflow;
  const finalNrtRequested =
    task.quality?.render_tier === 'final_nrt'
    || workflowPlan.selection.recommended_execution_mode === 'render_nrt';
  const managerPolicy = getRoleToolPolicy('manager');
  const builderPolicy = getRoleToolPolicy('builder', { finalNrtRequested });
  const criticPolicy = getRoleToolPolicy('critic');
  const manager: RolePacket = {
    role: 'manager',
    objective: managerObjective(task.goal, workflow),
    allowed_tools: [...managerPolicy.allowed_tools],
    forbidden_paths: [...managerPolicy.forbidden_paths],
    required_outputs: [
      'workflow_plan',
      'kb_snapshot',
      'session_summary_or_candidate_decision',
    ],
    completion_gates: [
      'Use governed workflow tools, not raw runtime tools.',
      'Do not advance promotion or acceptance without an explicit critic review.',
    ],
  };

  const builder: RolePacket = {
    role: 'builder',
    objective: builderObjective(task.goal, workflow, finalNrtRequested),
    allowed_tools: [...builderPolicy.allowed_tools],
    forbidden_paths: [...builderPolicy.forbidden_paths],
    required_outputs: [
      workflow === 'render_qa' || workflow === 'candidate_promotion'
        ? 'probe_run_result_if_manager_requests_retry'
        : 'probe_run_result',
    ],
    completion_gates: [
      finalNrtRequested
        ? 'Final-quality tasks may use sc_run_probe or sc_render_nrt, but must not close on draft render only.'
        : 'All SuperCollider execution must route through sc_run_probe.',
      `${taskTag} tasks may not bypass Pilot with raw runtime tools.`,
    ],
  };

  const critic: RolePacket = {
    role: 'critic',
    objective: criticObjective(workflow),
    allowed_tools: [...criticPolicy.allowed_tools],
    forbidden_paths: [...criticPolicy.forbidden_paths],
    required_outputs: [
      'audit_verdict',
      workflow === 'probe' ? 'review_note_if_escalation_is_needed' : 'review_note',
    ],
    completion_gates: [
      'Do not execute SuperCollider directly.',
      'Review notes must be explicit before any promotion-style recommendation.',
    ],
  };

  return { manager, builder, critic };
}

function managerObjective(goal: string, workflow: string): string {
  if (workflow === 'candidate_promotion') {
    return `Coordinate candidate promotion for "${goal}" and keep the review gate explicit.`;
  }
  if (workflow === 'render_qa') {
    return `Coordinate render QA for "${goal}" and require a governed summary before closure.`;
  }
  if (workflow === 'patch_refinement') {
    return `Coordinate a narrow refinement loop for "${goal}" without bypassing Pilot.`;
  }

  return `Coordinate a narrow probe loop for "${goal}" and preserve only governed artifacts.`;
}

function builderObjective(
  goal: string,
  workflow: string,
  finalNrtRequested: boolean,
): string {
  if (workflow === 'render_qa' || workflow === 'candidate_promotion') {
    return finalNrtRequested
      ? `Stay idle unless the manager requests a final-quality NRT render or retry for "${goal}".`
      : `Stay idle unless the manager requests a fresh probe or retry for "${goal}".`;
  }

  return `Execute the smallest possible governed probe for "${goal}" through sc_run_probe only.`;
}

function criticObjective(workflow: string): string {
  if (workflow === 'candidate_promotion') {
    return 'Read the governed trace, add an explicit review note, and decide whether promotion should advance.';
  }
  if (workflow === 'render_qa') {
    return 'Judge the render trace and artifact completeness before the manager closes the loop.';
  }

  return 'Audit the governed trace and call out whether the session should retry, revise, or archive.';
}

function inferSelectionInput(
  records: ArchiveRecord[],
  taskTag: ReturnType<typeof normalizeTaskTag>,
  candidateId: string | null,
  qualityTier?: 'draft' | 'final_nrt',
): WorkflowSelectionInput {
  const taskPolicy = getTaskPolicy(taskTag);
  const hasRenderArtifact = records.some(
    (record) =>
      record.kind === 'probe_run'
      && Boolean((record.payload as ProbeRunArchivePayload).result?.artifacts?.some(isRenderArtifactRef)),
  );
  const hasCandidate = candidateId !== null || collectSessionCandidateIds(records).length > 0;
  const hasPromotionAction = records.some(
    (record) =>
      record.kind === 'candidate_lifecycle'
      && isPromotionAction((record.payload as CandidateLifecyclePayload).event?.action),
  );

  return {
    task_label: taskTag ?? undefined,
    requested_outcome:
      hasPromotionAction || hasCandidate
        ? 'promote'
        : hasRenderArtifact || taskTag === 'sc-render-review'
          ? 'review'
          : 'explore',
    has_candidate: hasCandidate,
    has_render_artifact: hasRenderArtifact,
    requires_review: taskPolicy?.requires_review_note || hasPromotionAction,
    quality_tier: qualityTier,
  };
}

function recordToGovernedSteps(record: ArchiveRecord): { name: string }[] {
  if (record.kind === 'probe_run') {
    return [{ name: 'sc_run_probe' }];
  }
  if (record.kind === 'session_summary') {
    return [{ name: 'sc_summarize_session' }];
  }
  if (record.kind === 'review_note') {
    return [{ name: 'sc_candidate_action:add_review' }];
  }
  if (record.kind === 'candidate_lifecycle') {
    return [{ name: 'sc_candidate_action' }];
  }

  return [];
}

function buildPathCheck(
  workflow: string,
  steps: { name: string }[],
  pathResult: ReturnType<typeof evaluatePathCompliance>,
): SessionAudit['path_compliance'] {
  return {
    status: toAuditStatus(pathResult.summary.grade),
    summary:
      pathResult.summary.issues[0]?.message
      ?? 'Governed workflow trace stayed on the expected Pilot-oriented surface.',
    details: pathResult.summary.notes,
    workflow,
    steps: steps.map((step) => step.name),
    missing_required_steps: pathResult.missing_required_steps,
    disallowed_steps: pathResult.disallowed_steps,
    compliance_rate: pathResult.compliance_rate,
  };
}

function buildArtifactCheck(
  taskTag: ReturnType<typeof normalizeTaskTag>,
  workflow: string,
  renderArtifacts: ProbeArtifactRef[],
  requiredRenderMode: 'draft' | 'nrt' | null,
): SessionAudit['artifact_completion'] {
  const renderArtifactRequired =
    taskTag === 'sc-audio-generation'
    || taskTag === 'sc-render-review'
    || workflow === 'render_qa';
  const renderArtifactPresent = renderArtifacts.length > 0;
  const draftArtifactCount = renderArtifacts.filter((artifact) => artifact.render_mode !== 'nrt').length;
  const nrtArtifactCount = renderArtifacts.filter((artifact) => artifact.render_mode === 'nrt').length;
  const matchingRequiredModePresent =
    requiredRenderMode === null
      ? renderArtifactPresent
      : requiredRenderMode === 'nrt'
        ? nrtArtifactCount > 0
        : draftArtifactCount > 0;
  const status =
    renderArtifactRequired && (!renderArtifactPresent || !matchingRequiredModePresent)
      ? 'fail'
      : renderArtifactPresent
        ? 'pass'
        : 'warn';

  return {
    status,
    summary:
      renderArtifactRequired && !renderArtifactPresent
        ? 'This session should have a render artifact but none was recorded.'
        : renderArtifactRequired && requiredRenderMode === 'nrt' && !matchingRequiredModePresent
          ? 'This session requires an NRT artifact but only draft evidence was recorded.'
        : renderArtifactPresent
          ? 'Render artifact evidence is present in the governed trace.'
          : 'No render artifact was required for this session.',
    details: renderArtifacts.map((artifact) => artifact.path ?? artifact.label ?? 'render-artifact'),
    render_artifact_required: renderArtifactRequired,
    render_artifact_present: renderArtifactPresent,
    render_artifact_count: renderArtifacts.length,
    draft_artifact_count: draftArtifactCount,
    nrt_artifact_count: nrtArtifactCount,
    matching_required_mode_present: matchingRequiredModePresent,
    required_render_mode: requiredRenderMode,
  };
}

function buildSummaryCheck(
  present: boolean,
  recordCount: number,
): SessionAudit['summary_present'] {
  return {
    status: present ? 'pass' : 'fail',
    summary: present
      ? 'A session summary is present in the archive.'
      : 'No session summary was recorded for this session.',
    details: present
      ? ['Session summary is available for replay and memory aggregation.']
      : ['Governed loops should write summarize_session before audit and archival.'],
    present,
    record_count: recordCount,
  };
}

function buildReviewGateCheck(
  required: boolean,
  present: boolean,
  reviews: CandidateReviewNote[],
): SessionAudit['review_gate'] {
  const verdicts = reviews.map((review) => review.verdict);
  const status =
    required && !present
      ? 'fail'
      : present
        ? 'pass'
        : 'warn';

  return {
    status,
    summary:
      required && !present
        ? 'This session requires an explicit review note before it can advance.'
        : present
          ? 'Explicit review evidence is present in the archive.'
          : 'No review note was required for this session.',
    details: reviews.map((review) => `${review.reviewer}: ${review.summary}`),
    required,
    present,
    verdicts,
  };
}

function recommendNextStep(input: {
  hasRecords: boolean;
  hasSuccessfulProbe: boolean;
  pathStatus: AuditCheck['status'];
  artifactStatus: AuditCheck['status'];
  summaryPresent: boolean;
  reviewRequired: boolean;
  reviewPresent: boolean;
  candidateStatus: string | null;
  latestReviewVerdict: string | null;
}): SessionAudit['recommended_next_step'] {
  if (!input.hasRecords) {
    return 'retry';
  }
  if (!input.hasSuccessfulProbe || input.pathStatus === 'fail' || input.artifactStatus === 'fail') {
    return 'retry';
  }
  if (!input.summaryPresent || (input.reviewRequired && !input.reviewPresent)) {
    return 'revise';
  }
  if (input.latestReviewVerdict === 'reject') {
    return 'reject';
  }
  if (input.latestReviewVerdict === 'revisit') {
    return 'revise';
  }
  if (input.latestReviewVerdict === 'keep' && input.candidateStatus === 'draft') {
    return 'promote';
  }
  if (input.latestReviewVerdict === 'keep' && input.candidateStatus === 'candidate') {
    return 'accept';
  }
  if (input.candidateStatus === 'accepted' || input.candidateStatus === 'rejected') {
    return 'archive';
  }

  return 'archive';
}

function collectSessionCandidateIds(records: ArchiveRecord[]): string[] {
  const ids = new Set<string>();

  for (const record of records) {
    for (const candidateId of collectArchiveCandidateIds(record)) {
      ids.add(candidateId);
    }
  }

  return [...ids].filter(Boolean).sort();
}

function isPromotionAction(action: CandidateLifecycleAction | undefined): boolean {
  return action === 'promote' || action === 'accept' || action === 'reject' || action === 'revisit';
}

function inferQualityTierFromRecords(
  records: ArchiveRecord[],
): 'draft' | 'final_nrt' | undefined {
  for (const record of records) {
    if (record.kind !== 'probe_run') {
      continue;
    }

    const mode = (record.payload as ProbeRunArchivePayload).spec?.mode;
    if (mode === 'render_nrt') {
      return 'final_nrt';
    }
  }

  return undefined;
}

function isRenderArtifactRef(artifact: ProbeArtifactRef | undefined): artifact is ProbeArtifactRef {
  return Boolean(artifact && artifact.kind === 'render');
}

function toAuditStatus(grade: 'pass' | 'warn' | 'fail'): AuditCheck['status'] {
  return grade;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidQualityInput(value: unknown): value is NonNullable<TaskEnvelope['quality']> {
  if (!isPlainObject(value)) {
    return false;
  }

  if (
    typeof value.render_tier !== 'undefined'
    && value.render_tier !== 'draft'
    && value.render_tier !== 'final_nrt'
  ) {
    return false;
  }
  if (
    typeof value.engine_preference !== 'undefined'
    && value.engine_preference !== 'auto'
    && value.engine_preference !== 'scsynth'
    && value.engine_preference !== 'supernova'
  ) {
    return false;
  }
  if (
    typeof value.sample_format !== 'undefined'
    && value.sample_format !== 'float'
    && value.sample_format !== 'double'
  ) {
    return false;
  }

  return true;
}
