# Candidate Lifecycle

## States

Candidates currently move through these states:

- `draft`
- `candidate`
- `accepted`
- `rejected`
- `revisit`
- `deprecated`

## Allowed Lifecycle Actions

The workflow surface exposes one narrow action entrypoint with the following operations:

- `create_draft`
- `promote`
- `accept`
- `reject`
- `revisit`
- `rename`
- `split`
- `merge`
- `deprecate`
- `add_review`

## Gates

Promotion-style actions require explicit review evidence:

- `promote`
- `accept`
- `reject`
- `revisit`

Those gates are enforced in the workflow layer so candidate state changes stay tied to review notes rather than prompt-only assertions.

## Traceability Rules

Every candidate should remain traceable back to:

- the originating probe or session
- the relevant artifact or render result
- the review notes that justified the transition
- the summary that explains what should be preserved or discarded

## Why This Matters

The point of the lifecycle is not bureaucracy. The point is to avoid losing high-value experiments inside unstructured session logs or giant monolithic prompt transcripts.
