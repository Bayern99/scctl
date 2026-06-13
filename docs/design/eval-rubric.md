# Eval Rubric

## Goal

Evaluation in this repo measures execution quality and workflow discipline. It does not attempt to score artistic merit as an objective truth.

## Current Signals

| Signal | Meaning |
|--------|---------|
| `pilot_path_compliance_rate` | how often governed tasks actually used Pilot correctly |
| `artifact_completion_rate` | how often required artifacts were valid and non-empty |
| `render_success_rate` | how often render flows completed successfully |
| `candidate_acceptance_ratio` | how often reviewed candidates survived promotion |
| `review_rejection_reason_distribution` | what failure causes recur in review |
| `repeated_failures` | repeated workflow or runtime breakdowns across sessions |

## Evidence Sources

- `src/runtime/*` compliance and artifact verification
- `src/archive/*` probe, review, candidate, and session records
- `src/evals/*` deterministic grading helpers
- `src/workflow/service.ts` and `src/orchestration/service.ts` outputs

## Interpretation Rules

1. High route compliance does not imply strong music.
2. Low artifact completion is an infrastructure problem first.
3. Repeated failures should change workflow design before they change prompts.
4. Review distributions matter because they reveal waste patterns over time.

## Non-Goals

This rubric does not:

- rank aesthetics numerically
- replace human listening
- auto-reject candidates without review context
