# Decision: `SCCTL_GOVERNED_ROLE=builder` + `final_nrt=true`

## Canonical sources read

- `docs/superpowers/kb/role-tool-policies.json` — canonical role allowlist / forbidden-path policy.
- `src/harness/role-policies.ts` — in-process enforcement logic that loads the JSON.
- `docs/operator-runbook.md` — operator/debug vs governed surface guidance and draft vs final NRT rules.
- `docs/superpowers/status.md` — baseline status and `final_nrt` closure rule.

## Governing facts

1. `SCCTL_GOVERNED_ROLE=builder` selects the `builder` role policy.
2. `final_nrt=true` (i.e., `SCCTL_FINAL_NRT=true` / `1` / `yes`) selects the `builder.final_nrt` variant instead of `builder.default` and also activates the global `final_nrt_global_forbidden` list.
3. Enforcement is performed by `checkGovernedToolAllowed` in `src/harness/role-policies.ts`:
   - universal diagnostic tools are always allowed,
   - then `final_nrt_global_forbidden` is checked,
   - then the role policy `forbidden_paths` is checked,
   - finally the tool must be in the role policy `allowed_tools`.

## Allowed tools

Under `builder.final_nrt`, the allowed `scctl` tools are:

- **Universal diagnostic tools** (always permitted):
  - `sc_check`
  - `sc_status`
  - `sc_health`
  - `sc_logs`
  - `sc_stop`
  - `sc_reset`
  - `sc_reboot`
  - `sc_reclaim`
- **Builder final-NRT workflow tools**:
  - `sc_run_probe`
  - `sc_render_nrt`

Citations:
- `docs/superpowers/kb/role-tool-policies.json` lines 3–12 (`universal_diagnostic_tools`).
- `docs/superpowers/kb/role-tool-policies.json` lines 51–52 (`builder.final_nrt.allowed_tools`).
- `src/harness/role-policies.ts` lines 67–78 (`getRoleToolPolicy` selects `builder.final_nrt` when `finalNrtRequested` is true) and lines 96–123 (`checkGovernedToolAllowed`).

## Forbidden tools

Under `builder.final_nrt`, the following are forbidden:

- **Explicitly forbidden paths** for `builder.final_nrt`:
  - `sc_eval`
  - `sc_run_file`
  - `sc_render`
  - `python_or_external_audio_sidecars`
  - `direct_candidate_lifecycle_mutation`
- **Globally forbidden in final NRT mode**:
  - `sc_render`
- **Any other `scctl` tool not in the allowed list**, including governed workflow/orchestration tools such as:
  - `sc_plan_workflow`
  - `sc_prepare_handoff`
  - `sc_summarize_session`
  - `sc_candidate_action`
  - `sc_memory_summary`
  - `sc_audit_session`

In particular, `sc_render` is doubly blocked: it appears in `builder.final_nrt.forbidden_paths` and in `final_nrt_global_forbidden`.

Citations:
- `docs/superpowers/kb/role-tool-policies.json` lines 53–59 (`builder.final_nrt.forbidden_paths`).
- `docs/superpowers/kb/role-tool-policies.json` line 78 (`final_nrt_global_forbidden`).
- `src/harness/role-policies.ts` lines 110–116 and 118–120 (enforcement of forbidden paths and narrow allowlist).

## How to produce the final WAV

If the task marker declares `final_nrt=true`, the builder **must** use:

- **`sc_render_nrt`** (CLI alias: `render-nrt`)

This is the only render tool permitted in `builder.final_nrt` mode and is the canonical final-quality non-real-time render surface. Do **not** use `sc_render` / `render`; draft renders are explicitly insufficient for `final_nrt` closure and are rejected both by the builder policy and by the final-NRT global forbidden list.

Citations:
- `docs/operator-runbook.md` lines 28–29 and 86–89 (draft vs final NRT table; final export requires `render-nrt` / `sc_render_nrt`).
- `docs/operator-runbook.md` lines 39–42 (`SCCTL_FINAL_NRT` rejects draft `render` / `sc_render` while governed mode is active).
- `docs/superpowers/status.md` line 30–31 (if a task declares `final_nrt`, draft render is not sufficient for closure).

## Summary

| Need | Tool to call | Why |
|------|--------------|-----|
| Health / control / cleanup | `sc_check`, `sc_status`, `sc_health`, `sc_logs`, `sc_stop`, `sc_reset`, `sc_reboot`, `sc_reclaim` | Universal diagnostic tools are always allowed. |
| Probe a candidate | `sc_run_probe` | Explicitly allowed for `builder.final_nrt`. |
| Produce the final WAV | `sc_render_nrt` (CLI `render-nrt`) | Only final-quality render surface in `builder.final_nrt`. |
| Quick eval / run a file / draft render | `sc_eval`, `sc_run_file`, `sc_render` | Forbidden for builder; `sc_render` is also globally forbidden in `final_nrt`. |
| Planning / handoff / summarize / audit / memory | `sc_prepare_handoff`, `sc_summarize_session`, `sc_candidate_action`, `sc_audit_session`, `sc_memory_summary`, `sc_plan_workflow` | Not in builder allowlist; those are manager / critic responsibilities. |
