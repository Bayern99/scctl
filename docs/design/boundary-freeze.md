# Boundary Freeze

## Purpose

This document freezes the current infrastructure scope for `supercollider-pilot` so later phases do not re-expand the project while the control surface is still being hardened.

## What Pilot Is

`supercollider-pilot` is a local control layer for SuperCollider:

```text
Agent -> CLI / MCP -> ScDriver -> sclang -> scsynth -> audio artifact
```

It exists to make SuperCollider execution structured, governable, and auditable for agent-driven `text-to-audio` workflows.

## What Pilot Is Not

This phase does not turn Pilot into:

- a DAW
- a VST host
- a live performance router
- a mesh multi-agent platform
- a primitive ontology or aesthetic rules engine
- a large memory lake or embedding system

## Success Criteria For This Phase

The infrastructure phase is successful when the repo can reliably answer:

- Did the agent route SuperCollider work through Pilot?
- Did that route produce a valid artifact when one was required?
- Was the session summarized, reviewed, and archived?
- Can the next step be chosen from structured evidence instead of guesswork?

## Frozen Module Map

| Layer | Responsibility |
|------|----------------|
| `src/runtime/*` | execution, session state, recovery, render verification |
| `src/harness/*` | route enforcement, task policies, artifact completion rules |
| `src/lab/*` | probes, candidate lifecycle, review records |
| `src/archive/*` | append-only storage and memory summaries |
| `src/evals/*` | deterministic quality and route checks |
| `src/planner/*` | workflow selection and prompt scaffolding |
| `src/workflow/*` | orchestration of plan, probe, summary, candidate, memory |
| `src/orchestration/*` | role handoff, shared KB snapshots, session audit |

## Boundary Rules

1. Agent-facing creation flows must stay `Agent -> Pilot -> SuperCollider`.
2. Runtime does not absorb planner, archive, or orchestration policy.
3. Artistic judgement is not hard-coded into planner or eval layers.
4. New capabilities are gated behind structured evidence, not prompt rhetoric.
