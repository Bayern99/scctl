# SuperCollider Pilot Status

- Current baseline:
  - `Plan H + Plan A + Plan B + Plan C` are complete
  - `Workflow Surface` is green
  - `Agent Harness & Narrow Roles` is green
  - current execution package is `Phase 7 Broad Quality Expansion`
- Green baseline means:
  - `runtime + harness + lab + archive + eval + planner + workflow + orchestration` are wired
  - CLI/MCP workflow tools and governance tools are stable
  - typecheck, build, tests, and live smoke can be used as regression gates
- Governed creative loop:
  - `prepare_handoff`
  - `run_probe`
  - `summarize_session`
  - `add_review / candidate_action`
  - `audit_session`
  - `memory_summary`
- Raw runtime tools stay available as surfaces with different intent:
  - `sc_eval`
  - `sc_run_file`
  - `sc_render` for draft render
  - `sc_render_nrt` for final-quality NRT render
- Current quality expansion focus:
  - capability-aware `check` / `health`
  - explicit draft vs NRT render metadata
  - WAV-aware render evaluation
  - minimal `sc/` primitive bootstrap assets
- Governed creation and review should prefer workflow and orchestration tools over raw runtime tools.
- If a task declares `final_nrt`, draft render is not sufficient for closure.

## Honest limits

- **Soft route enforcement:** optional `task_tag` returns a `compliance` snapshot, but MCP/CLI do not hard-block invalid routes before execution.
- **Audit persistence:** successful `audit_session` / `audit-session` appends a `session_audit` record to the append-only archive.
- **No MCP RBAC yet:** role allowlists are carried in handoff packets and role docs, not enforced in code.
- **Live smoke is optional:** `npm run test:live` requires local SuperCollider and is not part of default CI.
- **Starter SC assets:** `sc/families/*/candidate-summary.md` may be filled for one reference family; others remain templates until dogfood sessions land.
