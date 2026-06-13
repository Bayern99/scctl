# Primitive Lab Spec

## Goal

Primitive Lab is the long-horizon experimentation layer. It exists so the project can accumulate probe results and candidate decisions without pretending that the final primitive language is already known.

## Minimal Loop

```text
plan workflow
-> run probe
-> summarize session
-> review / candidate action
-> memory summary
```

## Core Objects

### Probe

A probe is the smallest structured experiment unit. It can target:

- a timbral idea
- a control pattern
- a render behavior
- a runtime question

### Candidate

A candidate is a named result that has survived at least one review boundary and can continue through promotion, revision, or rejection.

## Design Principles

1. Do not force early convergence on Zhou Yi primitives.
2. Preserve failed experiments when they teach something reusable.
3. Keep artifacts and review notes linked to the probe that produced them.
4. Let vocabulary emerge from repeated practice, not one-time brainstorming.

## Current Implementation Surface

The current repo supports the lab loop through:

- `src/lab/probe-spec.ts`
- `src/lab/probe-runner.ts`
- `src/lab/candidate-registry.ts`
- `src/lab/candidate-review.ts`
- `src/workflow/service.ts`

## Non-Goals

Primitive Lab is not:

- an automatic primitive ontology generator
- an ML clustering system
- a substitute for artistic review
