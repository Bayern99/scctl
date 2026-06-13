import { describe, expect, it } from 'vitest';
import {
  SC_SPEC_SCHEMA_VERSION,
  isScSpec,
  validateScSpec,
  type ScSpec,
} from '../../src/planner/sc-spec-schema.js';
import { selectWorkflow } from '../../src/planner/workflow-selector.js';
import {
  buildBuilderPrompt,
  buildEvaluatorPrompt,
  buildPlannerSystemPrompt,
  buildWorkflowPrompt,
} from '../../src/planner/prompt-templates.js';

function makeBaseSpec(): ScSpec {
  return {
    schema_version: SC_SPEC_SCHEMA_VERSION,
    title: 'Short metallic pulse study',
    task_label: 'sc-probe',
    workflow: 'probe',
    intent: {
      prompt: 'Explore a short metallic pulse.',
      goals: ['Find a usable attack transient'],
      constraints: ['Keep it under 2 seconds'],
    },
    sound: {
      timbre_keywords: ['metallic', 'pulse'],
      duration_sec: 1.5,
    },
    execution: {
      mode: 'eval',
      code: '{ PinkNoise.ar(0.05) }.play;',
    },
    evaluation: {
      success_signals: ['clear transient', 'stable level'],
      rejection_signals: ['harsh clipping'],
      must_use_pilot_tools: true,
    },
  };
}

describe('planner scaffolding', () => {
  it('accepts a valid SC spec', () => {
    const spec = makeBaseSpec();
    expect(validateScSpec(spec)).toEqual({ ok: true, issues: [] });
    expect(isScSpec(spec)).toBe(true);
  });

  it('rejects workflow-specific missing context', () => {
    const spec = {
      ...makeBaseSpec(),
      workflow: 'candidate_promotion' as const,
    };

    const validation = validateScSpec(spec);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.path === '$.context.candidate_id')).toBe(true);
  });

  it('selects workflows from task context', () => {
    expect(selectWorkflow({ has_candidate: true }).workflow).toBe('candidate_promotion');
    expect(selectWorkflow({ has_render_artifact: true }).workflow).toBe('render_qa');
    expect(selectWorkflow({ has_reference_patch: true }).workflow).toBe('patch_refinement');
    expect(selectWorkflow({ task_label: 'sc-probe' }).workflow).toBe('probe');
  });

  it('builds prompts that keep workflow and roles explicit', () => {
    const spec = makeBaseSpec();
    const selection = selectWorkflow({ spec });

    expect(buildPlannerSystemPrompt()).toContain('Choose a narrow workflow');

    const workflowPrompt = buildWorkflowPrompt(selection, spec);
    expect(workflowPrompt).toContain('Workflow: probe');
    expect(workflowPrompt).toContain(
      'Recommended governed route: sc_prepare_handoff -> sc_run_probe -> sc_summarize_session -> sc_audit_session -> sc_memory_summary',
    );

    expect(buildBuilderPrompt(spec)).toContain('Builder role');
    expect(buildEvaluatorPrompt(spec)).toContain('Critic role');
  });
});
