import type { ScSpec } from './sc-spec-schema.js';
import type { WorkflowSelection } from './workflow-selector.js';

export function buildPlannerSystemPrompt(): string {
  return [
    'You are the SuperCollider Pilot planner.',
    'Choose a narrow workflow before choosing any tool path.',
    'Stay within probe, patch_refinement, render_qa, or candidate_promotion.',
    'Do not pretend to be the final artistic judge.',
    'Emit structured SC specs before asking for code generation.',
  ].join('\n');
}

export function buildWorkflowPrompt(
  selection: WorkflowSelection,
  spec: Pick<ScSpec, 'title' | 'intent' | 'sound' | 'evaluation' | 'quality'>,
): string {
  return [
    `Workflow: ${selection.workflow}`,
    `Confidence: ${selection.confidence}`,
    `Title: ${spec.title}`,
    `Prompt: ${spec.intent.prompt}`,
    `Goals: ${spec.intent.goals.join('; ')}`,
    `Constraints: ${spec.intent.constraints.join('; ')}`,
    `Timbre keywords: ${spec.sound.timbre_keywords.join(', ')}`,
    `Success signals: ${spec.evaluation.success_signals.join('; ')}`,
    `Quality tier: ${spec.quality?.render_tier ?? 'draft'}`,
    `Engine preference: ${spec.quality?.engine_preference ?? 'auto'}`,
    `Sample format: ${spec.quality?.sample_format ?? 'float'}`,
    `Recommended governed route: ${selection.recommended_tools.join(' -> ')}`,
    `Primary role: ${selection.primary_role}`,
    `Reasoning anchors: ${selection.reasons.join(' ')}`,
  ].join('\n');
}

export function buildBuilderPrompt(spec: ScSpec): string {
  return [
    'Builder role: generate the smallest useful SuperCollider step for this spec.',
    `Workflow: ${spec.workflow}`,
    `Execution mode: ${spec.execution.mode}`,
    `Task label: ${spec.task_label}`,
    `Render tier: ${spec.quality?.render_tier ?? 'draft'}`,
    `Engine preference: ${spec.quality?.engine_preference ?? 'auto'}`,
    `Sample format: ${spec.quality?.sample_format ?? 'float'}`,
    `Prompt: ${spec.intent.prompt}`,
    `Goals: ${spec.intent.goals.join('; ')}`,
    `Constraints: ${spec.intent.constraints.join('; ')}`,
    'Prefer a probe-sized change unless the spec explicitly demands a render.',
  ].join('\n');
}

export function buildEvaluatorPrompt(spec: ScSpec): string {
  return [
    'Critic role: read artifacts, logs, and eval signals only.',
    `Workflow: ${spec.workflow}`,
    `Title: ${spec.title}`,
    `Render tier: ${spec.quality?.render_tier ?? 'draft'}`,
    `Success signals: ${spec.evaluation.success_signals.join('; ')}`,
    `Rejection signals: ${(spec.evaluation.rejection_signals ?? []).join('; ')}`,
    'Do not replace the execution path with free-form code suggestions.',
  ].join('\n');
}
