import path from 'path';
import { ArchiveStore } from '../archive/archive-store.js';
import {
  ArchiveMemorySummary,
  ArchiveMemorySummaryOptions,
} from '../archive/archive-types.js';
import {
  buildSessionSummary,
  SessionSummary,
} from '../archive/session-summary.js';
import { evaluatePathCompliance, DEFAULT_PILOT_STEPS } from '../evals/path-compliance.js';
import { evaluateRenderQuality } from '../evals/render-quality.js';
import { evaluateTaskOutcome } from '../evals/task-outcome.js';
import { gradeTrace } from '../evals/trace-grading.js';
import { getTaskPolicy } from '../harness/policies.js';
import { CandidateRegistry } from '../lab/candidate-registry.js';
import {
  CandidateReviewNote,
  PrimitiveCandidate,
  ProbeDriver,
  ProbeRunResult,
  ProbeSpec,
} from '../lab/lab-types.js';
import { runProbe } from '../lab/probe-runner.js';
import { ScSpec, ScSpecValidationResult, validateScSpec } from '../planner/sc-spec-schema.js';
import {
  buildBuilderPrompt,
  buildEvaluatorPrompt,
  buildPlannerSystemPrompt,
  buildWorkflowPrompt,
} from '../planner/prompt-templates.js';
import {
  selectWorkflow,
  WorkflowSelection,
  WorkflowSelectionInput,
} from '../planner/workflow-selector.js';
import { getWorkflowDefinition } from '../planner/workflow-definitions.js';
import { ScDriver } from '../runtime/driver.js';
import { readScdFile } from '../runtime/sc-file.js';
import { DriverResult, RenderArtifact } from '../runtime/driver-types.js';

export type WorkflowAction =
  | 'plan_workflow'
  | 'run_probe'
  | 'summarize_session'
  | 'candidate_action'
  | 'memory_summary';

export type WorkflowErrorKind = 'invalid_argument' | 'not_found' | 'workflow_failed';

export interface WorkflowSuccessResult<TPayload> {
  success: true;
  action: WorkflowAction;
  summary: string;
  error_kind: null;
  archive_root: string;
  payload: TPayload;
}

export interface WorkflowErrorResult<TPayload = never> {
  success: false;
  action: WorkflowAction;
  summary: string;
  error_kind: WorkflowErrorKind;
  archive_root: string;
  payload?: TPayload;
  issues?: string[];
}

export type WorkflowResult<TPayload> = WorkflowSuccessResult<TPayload> | WorkflowErrorResult<TPayload>;

export interface PlanWorkflowPayload {
  builder_prompt: string | null;
  evaluator_prompt: string | null;
  planner_system_prompt: string;
  selection: WorkflowSelection;
  validation: ScSpecValidationResult | null;
  validated_spec: ScSpec | null;
  workflow_prompt: string | null;
  path_expectation: {
    allowed_steps: readonly string[];
    required_steps: string[];
  };
}

export interface RunProbePayload {
  evals: {
    path_compliance: ReturnType<typeof evaluatePathCompliance>;
    render_quality: ReturnType<typeof evaluateRenderQuality> | null;
    task_outcome: ReturnType<typeof evaluateTaskOutcome>;
    trace: ReturnType<typeof gradeTrace>;
  };
  probe_run: ProbeRunResult;
}

export interface SummarizeSessionPayload {
  record_id: string;
  summary: SessionSummary;
}

export interface CandidateActionPayload {
  candidate: PrimitiveCandidate;
}

export interface MemorySummaryPayload {
  memory_summary: ArchiveMemorySummary;
}

export type CandidateActionKind =
  | 'create_draft'
  | 'promote'
  | 'accept'
  | 'reject'
  | 'revisit'
  | 'rename'
  | 'split'
  | 'merge'
  | 'deprecate'
  | 'add_review';

export interface CandidateActionInput {
  action: CandidateActionKind;
  artifacts?: PrimitiveCandidate['artifacts'];
  candidate_id: string;
  metadata?: Record<string, unknown>;
  name?: string;
  next_name?: string;
  review?: CandidateReviewNote;
  session_id: string;
  source_probe_id?: string;
  split_into?: string[];
  merged_from?: string[];
  superseded_by?: string[];
  summary?: string;
}

export interface PlanWorkflowInput {
  context?: WorkflowSelectionInput;
  spec?: unknown;
}

export interface WorkflowServiceOptions {
  archiveRoot?: string;
  cwd?: string;
  driver?: ScDriver;
  env?: NodeJS.ProcessEnv;
}

export interface RunProbeInput {
  spec: ProbeSpec;
}

export interface SummarizeSessionRequest {
  failures: string[];
  notes?: string[];
  outcome: 'failure' | 'mixed' | 'success';
  preserved_items: string[];
  probe_id?: string;
  session_id: string;
  task: string;
}

class DriverProbeAdapter implements ProbeDriver {
  constructor(private readonly driver: ScDriver) {}

  public async eval(code: string) {
    return this.normalize(await this.driver.eval(code));
  }

  public async runFile(filePath: string) {
    return this.normalize(await this.driver.runFile(filePath, readScdFile));
  }

  public async render(options: {
    durationSec?: number;
    filePath?: string;
    outPath: string;
    userCode?: string;
  }) {
    let userCode = options.userCode;
    if (!userCode && options.filePath) {
      userCode = readScdFile(options.filePath);
    }

    return this.normalize(
      await this.driver.render({
        durationSec: options.durationSec,
        outPath: options.outPath,
        userCode: userCode ?? '',
      }),
    );
  }

  public async renderNrt(options: {
    durationSec?: number;
    enginePreference?: 'auto' | 'scsynth' | 'supernova';
    outPath: string;
    sampleFormat?: 'float' | 'double';
    sourcePath: string;
  }) {
    return this.normalize(await this.driver.renderNrt(options));
  }

  private normalize(
    result: DriverResult<RenderArtifact | undefined>,
  ) {
    return {
      success: result.success,
      summary: result.summary,
      raw_output: result.raw_output,
      artifact: result.artifact,
    };
  }
}

export class WorkflowService {
  private readonly archive: ArchiveStore;
  private readonly driver: ScDriver;

  constructor(options: WorkflowServiceOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    const env = options.env ?? process.env;
    const archiveRoot =
      options.archiveRoot ?? env.SCCTL_ARCHIVE_ROOT ?? path.resolve(cwd, '.scctl/archive');

    this.archive = new ArchiveStore(archiveRoot);
    this.driver = options.driver ?? new ScDriver();
  }

  public getArchiveRoot(): string {
    return this.archive.getRootDir();
  }

  public async planWorkflow(
    input: PlanWorkflowInput,
  ): Promise<WorkflowResult<PlanWorkflowPayload>> {
    const plannerSystemPrompt = buildPlannerSystemPrompt();
    const validation = input.spec ? validateScSpec(input.spec) : null;

    if (validation && !validation.ok) {
      const selection = selectWorkflow(input.context ?? {});
      const definition = definitionFromSelection(selection);
      return this.error('plan_workflow', 'invalid_argument', 'SC spec validation failed.', {
        builder_prompt: null,
        evaluator_prompt: null,
        planner_system_prompt: plannerSystemPrompt,
        selection,
        validation,
        validated_spec: null,
        workflow_prompt: null,
        path_expectation: {
          allowed_steps: DEFAULT_PILOT_STEPS,
          required_steps: [...definition.required_trace_steps],
        },
      }, validation.issues.map((issue) => `${issue.path}: ${issue.message}`));
    }

    const spec = validation?.ok ? (input.spec as ScSpec) : null;
    const selection = selectWorkflow(spec ? { spec } : input.context ?? {});
    const definition = definitionFromSelection(selection);

    return this.success('plan_workflow', 'Workflow plan prepared.', {
      builder_prompt: spec ? buildBuilderPrompt(spec) : null,
      evaluator_prompt: spec ? buildEvaluatorPrompt(spec) : null,
      planner_system_prompt: plannerSystemPrompt,
      selection,
      validation,
      validated_spec: spec,
      workflow_prompt: spec
        ? buildWorkflowPrompt(selection, spec)
        : null,
      path_expectation: {
        allowed_steps: DEFAULT_PILOT_STEPS,
        required_steps: [...definition.required_trace_steps],
      },
    });
  }

  public async runProbeCommand(
    input: RunProbeInput,
  ): Promise<WorkflowResult<RunProbePayload>> {
    try {
      const adapter = new DriverProbeAdapter(this.driver);
      const probeRun = await runProbe(adapter, input.spec, {
        archive: this.archive,
      });
      const tag = inferTaskLabel(input.spec.tags);
      const taskPolicy = getTaskPolicy(tag);
      const selection = selectWorkflow({
        task_label: tag,
        requested_outcome: tag === 'sc-render-review' ? 'review' : 'explore',
        has_render_artifact:
          input.spec.mode === 'render' || input.spec.mode === 'render_nrt',
        quality_tier: input.spec.mode === 'render_nrt' ? 'final_nrt' : undefined,
        requires_review: taskPolicy?.requires_review_note,
      });
      const artifact = probeRun.artifacts.find((entry) => entry.kind === 'render');
      const renderQuality =
        artifact?.path
          ? evaluateRenderQuality({
              success: probeRun.success,
              artifact: {
                path: artifact.path,
                bytes: artifact.bytes,
                channel_count: artifact.channel_count,
                duration_sec: artifact.duration_sec,
                frame_count: artifact.frame_count,
                render_mode: artifact.render_mode,
                sample_format: artifact.sample_format,
                sample_rate: artifact.sample_rate,
              },
              expected_duration_sec: input.spec.render?.duration_sec,
            })
          : null;

      return this.success('run_probe', 'Probe executed and archived.', {
        evals: {
          path_compliance: evaluatePathCompliance({
            workflow: selection.workflow,
            steps: [{ name: 'sc_run_probe', kind: 'tool' }],
            requiredSteps: ['sc_run_probe'],
          }),
          render_quality: renderQuality,
          task_outcome: evaluateTaskOutcome({
            task_label: tag,
            workflow: selection.workflow,
            execution_success: probeRun.success,
            artifact_present: probeRun.artifacts.some((artifact) => artifact.kind === 'render'),
          }),
          trace: gradeTrace({
            steps: [
              {
                name: 'sc_run_probe',
                category: 'execute',
                success: probeRun.success,
              },
            ],
          }),
        },
        probe_run: probeRun,
      });
    } catch (err: any) {
      return this.error('run_probe', 'invalid_argument', err.message, undefined, [err.message]);
    }
  }

  public async summarizeSessionCommand(
    input: SummarizeSessionRequest,
  ): Promise<WorkflowResult<SummarizeSessionPayload>> {
    try {
      const probe = input.probe_id
        ? await this.findProbeResult(input.probe_id, input.session_id)
        : undefined;
      const summary = buildSessionSummary({
        session_id: input.session_id,
        task: input.task,
        outcome: input.outcome,
        preserved_items: input.preserved_items,
        failures: input.failures,
        notes: input.notes,
        probe,
      });
      const record = await this.archive.append<SessionSummary>({
        kind: 'session_summary',
        session_id: input.session_id,
        payload: summary,
        created_at: summary.created_at,
      });

      return this.success('summarize_session', 'Session summary recorded.', {
        record_id: record.id,
        summary,
      });
    } catch (err: any) {
      return this.error(
        'summarize_session',
        'invalid_argument',
        err.message,
        undefined,
        [err.message],
      );
    }
  }

  public async candidateActionCommand(
    input: CandidateActionInput,
  ): Promise<WorkflowResult<CandidateActionPayload>> {
    try {
      const registry = new CandidateRegistry(this.archive);
      let candidate: PrimitiveCandidate;

      if (needsReviewGate(input.action) && !input.review) {
        return this.error(
          'candidate_action',
          'invalid_argument',
          'This candidate action requires an explicit review note.',
          undefined,
          ['review is required for promote, accept, reject, and revisit actions.'],
        );
      }

      switch (input.action) {
        case 'create_draft':
          if (!input.name?.trim() || !input.source_probe_id?.trim()) {
            return this.error(
              'candidate_action',
              'invalid_argument',
              'create_draft requires name and source_probe_id.',
            );
          }
          candidate = await registry.createDraft({
            candidate_id: input.candidate_id,
            name: input.name,
            source_probe_id: input.source_probe_id,
            session_id: input.session_id,
            artifacts: input.artifacts,
            metadata: input.metadata,
            summary: input.summary,
          });
          break;
        case 'add_review':
          if (!input.review) {
            return this.error(
              'candidate_action',
              'invalid_argument',
              'add_review requires a review note.',
            );
          }
          candidate = await registry.addReview(
            input.session_id,
            input.candidate_id,
            input.review,
          );
          break;
        case 'promote':
          candidate = await this.reviewedTransition(
            registry,
            input,
            async () =>
              registry.promote(
                input.session_id,
                input.candidate_id,
                input.summary ?? input.review!.summary,
              ),
          );
          break;
        case 'accept':
          candidate = await this.reviewedTransition(
            registry,
            input,
            async () =>
              registry.accept(
                input.session_id,
                input.candidate_id,
                input.summary ?? input.review!.summary,
              ),
          );
          break;
        case 'reject':
          candidate = await this.reviewedTransition(
            registry,
            input,
            async () =>
              registry.reject(
                input.session_id,
                input.candidate_id,
                input.summary ?? input.review!.summary,
              ),
          );
          break;
        case 'revisit':
          candidate = await this.reviewedTransition(
            registry,
            input,
            async () =>
              registry.revisit(
                input.session_id,
                input.candidate_id,
                input.summary ?? input.review!.summary,
              ),
          );
          break;
        case 'rename':
          if (!input.next_name?.trim()) {
            return this.error(
              'candidate_action',
              'invalid_argument',
              'rename requires next_name.',
            );
          }
          candidate = await registry.rename(
            input.session_id,
            input.candidate_id,
            input.next_name,
            input.summary ?? `Renamed candidate to ${input.next_name}.`,
          );
          break;
        case 'split':
          if (!input.split_into || input.split_into.length === 0) {
            return this.error(
              'candidate_action',
              'invalid_argument',
              'split requires split_into.',
            );
          }
          candidate = await registry.split(
            input.session_id,
            input.candidate_id,
            input.split_into,
            input.summary ?? 'Split candidate into multiple branches.',
          );
          break;
        case 'merge':
          if (!input.merged_from || input.merged_from.length === 0) {
            return this.error(
              'candidate_action',
              'invalid_argument',
              'merge requires merged_from.',
            );
          }
          candidate = await registry.merge(
            input.session_id,
            input.candidate_id,
            input.merged_from,
            input.summary ?? 'Merged candidate lineage.',
          );
          break;
        case 'deprecate':
          candidate = await registry.deprecate(
            input.session_id,
            input.candidate_id,
            input.superseded_by ?? [],
            input.summary ?? 'Deprecated candidate.',
          );
          break;
        default:
          return this.error(
            'candidate_action',
            'invalid_argument',
            `Unsupported candidate action: ${(input as { action: string }).action}`,
          );
      }

      return this.success('candidate_action', 'Candidate action applied.', {
        candidate,
      });
    } catch (err: any) {
      const errorKind = String(err.message).startsWith('Unknown candidate:')
        ? 'not_found'
        : 'invalid_argument';
      return this.error('candidate_action', errorKind, err.message, undefined, [err.message]);
    }
  }

  public async memorySummaryCommand(
    input: ArchiveMemorySummaryOptions = {},
  ): Promise<WorkflowResult<MemorySummaryPayload>> {
    try {
      const memorySummary = await this.archive.buildMemorySummary(input);
      return this.success('memory_summary', 'Project memory summary computed.', {
        memory_summary: memorySummary,
      });
    } catch (err: any) {
      return this.error('memory_summary', 'workflow_failed', err.message, undefined, [err.message]);
    }
  }

  private async reviewedTransition(
    registry: CandidateRegistry,
    input: CandidateActionInput,
    transition: () => Promise<PrimitiveCandidate>,
  ): Promise<PrimitiveCandidate> {
    await registry.addReview(input.session_id, input.candidate_id, input.review!);
    return transition();
  }

  private async findProbeResult(
    probeId: string,
    sessionId: string,
  ): Promise<ProbeRunResult | undefined> {
    const records = await this.archive.listBySession<{ result?: ProbeRunResult; spec?: ProbeSpec }>(
      sessionId,
    );
    const match = records.find(
      (record) =>
        record.kind === 'probe_run' &&
        record.payload &&
        typeof record.payload === 'object' &&
        'result' in record.payload &&
        (record.payload.result as ProbeRunResult | undefined)?.probe_id === probeId,
    );
    return match?.payload.result;
  }

  private success<TPayload>(
    action: WorkflowAction,
    summary: string,
    payload: TPayload,
  ): WorkflowSuccessResult<TPayload> {
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
    action: WorkflowAction,
    errorKind: WorkflowErrorKind,
    summary: string,
    payload?: TPayload,
    issues?: string[],
  ): WorkflowErrorResult<TPayload> {
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

function needsReviewGate(action: CandidateActionKind): boolean {
  return (
    action === 'promote' ||
    action === 'accept' ||
    action === 'reject' ||
    action === 'revisit'
  );
}

function inferTaskLabel(tags: string[]): 'sc-audio-generation' | 'sc-probe' | 'sc-render-review' {
  if (tags.includes('sc-audio-generation')) {
    return 'sc-audio-generation';
  }
  if (tags.includes('sc-render-review')) {
    return 'sc-render-review';
  }
  return 'sc-probe';
}

function definitionFromSelection(selection: WorkflowSelection) {
  return getWorkflowDefinition(selection.workflow, {
    finalNrtRequested: selection.recommended_execution_mode === 'render_nrt',
    reviewRequired: selection.recommended_tools.includes('sc_candidate_action:add_review'),
  });
}
