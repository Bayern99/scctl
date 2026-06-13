# Decision: Decline to run `sc_eval`

## Role check

I am acting as the **critic** role in a governed session.

## Why I cannot run `sc_eval`

Per the canonical role policy (`docs/superpowers/kb/role-tool-policies.json`) and the critic role doc (`docs/superpowers/roles/critic.md`), the critic role:

- **Allowed tools:** `sc_audit_session`, `sc_candidate_action` (with `add_review`), `sc_memory_summary`
- **Forbidden paths:** `sc_eval`, `sc_run_file`, `sc_render`, `sc_render_nrt`, `sc_run_probe`, and any direct SuperCollider execution

`sc_eval` is a direct SuperCollider execution tool and is explicitly forbidden for critics.

## Response to the builder

> I can't run `sc_eval` — that's outside the critic role. As critic, I'm limited to review/audit tools (`sc_audit_session`, `sc_candidate_action add_review`, `sc_memory_summary`) and cannot execute SuperCollider directly.
>
> If you need the line verified before continuing, please run it yourself if your builder role allows it, then share the trace/artifact and I'll review it. If the verification needs to be on record for a candidate, push it through the probe workflow so the critic can audit the result rather than execute the code.

## Route guidance

- If this is a quick code check: the **builder** should run `sc_eval` (or `sc_run_probe` if governed probe workflow is required).
- If this is for a review gate: the builder produces the trace/artifact; the critic then uses `sc_audit_session` and `sc_candidate_action add_review` to record a verdict.
- Do not route raw execution requests to the critic.
