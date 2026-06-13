# Route Enforcement Rules

## Goal

Route enforcement exists to prove that SuperCollider tasks actually ran through Pilot, rather than only claiming they did.

## Task Tags

| Task tag | Required terminal action | Requires `.scd` source | Requires render artifact | Requires review note |
|----------|--------------------------|------------------------|--------------------------|----------------------|
| `sc-audio-generation` | `render` | yes | yes | yes |
| `sc-probe` | none | no | no | no |
| `sc-render-review` | `render` | no | yes | yes |

The canonical source for these rules is `src/harness/policies.ts`.

## Required Evidence

When a task tag is present, callers should preserve:

- the Pilot action that was taken
- the source kind (`inline_code`, `scd_file`, or `none`)
- the source path when `scd_file` was used
- the artifact verification result when a render was required
- the completion snapshot attached to the driver result

## Enforcement Model

`src/harness/completion-rules.ts` evaluates a task result into a `ComplianceSnapshot`.

That snapshot answers:

- whether Pilot was used
- whether a render artifact was complete
- whether the route satisfied the task policy
- why the task passed, failed, or was not applicable

## Non-Goals

This phase does not yet:

- block every invalid request before execution
- enforce review-note presence inside runtime
- infer aesthetic quality from route compliance
- allow non-Pilot side paths for SC audio tasks
