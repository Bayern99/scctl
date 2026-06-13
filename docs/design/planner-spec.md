# Planner Spec

## Goal

Planner exists to reduce workflow confusion. It chooses the right path for a task and prepares structured prompts, but it does not act as an all-knowing aesthetic brain.

## Inputs

Planner accepts either:

- a complete `ScSpec`
- partial task context that can be validated into a workflow decision

## Outputs

Planner returns:

- workflow selection
- validated spec or validation issues
- builder / evaluator prompt templates
- recommended execution mode
- path-compliance expectations

## Supported Workflow Families

- `probe`
- `patch_refinement`
- `render_qa`
- `candidate_promotion`

## Rules

1. Planner decides workflow before execution.
2. Planner does not bypass review or artifact gates.
3. Planner does not store artistic truth; it only scaffolds work.
4. Invalid specs return structured issues instead of silent auto-rewrites.

## Relation To Orchestration

`src/orchestration/service.ts` consumes planner and memory outputs to prepare role packets for:

- manager
- sc-builder
- critic

The orchestration layer governs who may act next; planner only helps frame the work.
