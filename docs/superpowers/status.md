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

- **Soft route enforcement by default:** optional `task_tag` returns a `compliance` snapshot; MCP/CLI do not hard-block invalid routes unless governed mode is enabled (see below).
- **Opt-in MCP/CLI RBAC (Phase 7.1):** set `SCCTL_GOVERNED_ROLE=manager|builder|critic` to enforce role tool allowlists in-process. Unset = operator/debug behavior unchanged.
- **Opt-in final_nrt hardening:** set `SCCTL_FINAL_NRT=1` with a governed role to reject draft `sc_render` / `render` in addition to role forbidden lists.
- **IDE hooks:** `hooks/hooks.json` + `.cursor/hooks.json` call `hooks/scctl-governed-preflight.js` before raw MCP runtime tools; `hooks/scctl-session-start.js` on `sessionStart` for governed loop hints.
- **Project Agent skills (Phase 7.2):** `.agents/skills/scctl-*` — procedural guides; spec in `docs/guides/agent-skills-spec.zh-CN.md`; human tutorial in `docs/guides/governed-pilot-tutorial.zh-CN.md`; consumer setup in `docs/guides/consumer-bootstrap.zh-CN.md`.
- **Merge prep:** branch `codex/agent-harness-narrow-roles` — checklist in `docs/MERGE-READINESS.md`; changelog under `[Unreleased]` in `CHANGELOG.md`.
- **Audit persistence:** successful `audit_session` / `audit-session` appends a `session_audit` record to the append-only archive.
- **Live smoke is optional:** `npm run test:live` requires local SuperCollider and is not part of default CI.
- **Starter SC assets:** `sc/families/*/candidate-summary.md` may be filled for one reference family; others remain templates until dogfood sessions land.
