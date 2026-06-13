import {
  type ScExecutionMode,
  type ScSpec,
  type ScTaskLabel,
  type WorkflowKind,
} from './sc-spec-schema.js';
import type { RenderTier } from '../runtime/driver-types.js';
import {
  getWorkflowDefinition,
  type WorkflowPrimaryRole,
} from './workflow-definitions.js';

export interface WorkflowSelectionInput {
  task_label?: ScTaskLabel;
  requested_outcome?: 'explore' | 'refine' | 'review' | 'promote';
  has_reference_patch?: boolean;
  has_render_artifact?: boolean;
  has_candidate?: boolean;
  requires_review?: boolean;
  quality_tier?: RenderTier;
  spec?: Partial<ScSpec>;
}

export interface WorkflowSelection {
  workflow: WorkflowKind;
  confidence: 'high' | 'medium';
  reasons: string[];
  recommended_execution_mode: ScExecutionMode;
  recommended_tools: string[];
  primary_role: WorkflowPrimaryRole;
}

export function selectWorkflow(
  input: WorkflowSelectionInput,
): WorkflowSelection {
  const reasons: string[] = [];
  const finalNrtRequested =
    input.quality_tier === 'final_nrt'
    || input.spec?.quality?.render_tier === 'final_nrt'
    || input.spec?.execution?.mode === 'render_nrt';

  if (input.spec?.workflow) {
    reasons.push(`Spec requested workflow ${input.spec.workflow}.`);
    return selectionForWorkflow(
      input.spec.workflow,
      reasons,
      'high',
      finalNrtRequested,
      input.requires_review || undefined,
    );
  }

  if (input.has_candidate || input.requested_outcome === 'promote') {
    reasons.push('Candidate context is present, so promotion review is the primary job.');
    return selectionForWorkflow(
      'candidate_promotion',
      reasons,
      'high',
      finalNrtRequested,
      true,
    );
  }

  if (
    input.has_render_artifact ||
    input.requires_review ||
    input.task_label === 'sc-render-review' ||
    input.requested_outcome === 'review'
  ) {
    reasons.push('Render artifact or review gate is present, so render QA should run first.');
    return selectionForWorkflow(
      'render_qa',
      reasons,
      'high',
      finalNrtRequested,
      input.requires_review || undefined,
    );
  }

  if (
    input.has_reference_patch ||
    input.requested_outcome === 'refine' ||
    input.spec?.context?.patch_path
  ) {
    reasons.push('Reference patch context exists, so refinement is more appropriate than free exploration.');
    return selectionForWorkflow(
      'patch_refinement',
      reasons,
      'medium',
      finalNrtRequested,
      input.requires_review || undefined,
    );
  }

  reasons.push('No candidate, review artifact, or patch anchor was supplied, so start with a probe.');
  return selectionForWorkflow(
    'probe',
    reasons,
    'medium',
    finalNrtRequested,
    input.requires_review || undefined,
  );
}

function selectionForWorkflow(
  workflow: WorkflowKind,
  reasons: string[],
  confidence: 'high' | 'medium',
  finalNrtRequested: boolean,
  reviewRequired?: boolean,
): WorkflowSelection {
  const definition = getWorkflowDefinition(workflow, {
    finalNrtRequested,
    reviewRequired,
  });

  return {
    workflow,
    confidence,
    reasons,
    recommended_execution_mode: definition.recommended_execution_mode,
    recommended_tools: [...definition.recommended_tools],
    primary_role: definition.primary_role,
  };
}
