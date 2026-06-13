# Decision: builder role + final_nrt=true

## Governing sources

- Role definition: `docs/superpowers/roles/sc-builder.md`
- Canonical policy: `docs/superpowers/kb/role-tool-policies.json`
- Policy loader / enforcement logic: `src/harness/role-policies.ts`

## Effective policy variant

With `SCCTL_GOVERNED_ROLE=builder` and the task marker `final_nrt=true`, the active policy is the builder `final_nrt` variant (`role-tool-policies.json` lines 51–60) because the handoff/spec explicitly declares final NRT (`sc-builder.md` lines 10–11, 28–29).

## Allowed tools

| Tool | Why allowed |
|------|-------------|
| `sc_run_probe` | Explicitly in builder `final_nrt.allowed_tools` (`role-tool-policies.json` line 52) and the only normal builder execution path (`sc-builder.md` lines 9, 27). |
| `sc_render_nrt` | Added to `allowed_tools` only in the `final_nrt` variant (`role-tool-policies.json` line 52; `sc-builder.md` line 10). |
| Universal diagnostic tools: `sc_check`, `sc_status`, `sc_health`, `sc_logs`, `sc_stop`, `sc_reset`, `sc_reboot`, `sc_reclaim` | Always permitted regardless of role because `checkGovernedToolAllowed` returns `null` for `universal_diagnostic_tools` (`role-tool-policies.json` lines 3–12; `src/harness/role-policies.ts` lines 80–82, 106–108). |

## Forbidden tools / paths

| Tool / Path | Why forbidden |
|-------------|---------------|
| `sc_eval` | Listed in builder `final_nrt.forbidden_paths` (`role-tool-policies.json` line 54; `sc-builder.md` line 14). |
| `sc_run_file` | Listed in builder `final_nrt.forbidden_paths` (`role-tool-policies.json` line 55; `sc-builder.md` line 15). |
| `sc_render` | Forbidden in builder `final_nrt.forbidden_paths` and also globally forbidden under final NRT via `final_nrt_global_forbidden` (`role-tool-policies.json` lines 56, 78; `sc-builder.md` lines 16–17, 28). |
| `python_or_external_audio_sidecars` | Listed in builder `final_nrt.forbidden_paths` (`role-tool-policies.json` line 57; `sc-builder.md` line 18). |
| `direct_candidate_lifecycle_mutation` | Listed in builder `final_nrt.forbidden_paths` (`role-tool-policies.json` line 58; `sc-builder.md` line 19). |
| Other governed workflow tools not in the builder allowlist (`sc_plan_workflow`, `sc_prepare_handoff`, `sc_summarize_session`, `sc_candidate_action`, `sc_memory_summary`, `sc_audit_session`) | Builder policy only explicitly allows `sc_run_probe` (+ `sc_render_nrt` in final NRT). Any tool not in `allowed_tools` and not a universal diagnostic tool is rejected by `checkGovernedToolAllowed` (`src/harness/role-policies.ts` lines 118–120). |

## How to produce the final WAV

1. Continue using `sc_run_probe` for iterative probe execution routed through Pilot.
2. When the task is ready for final delivery, call `sc_render_nrt` — **not** `sc_render` — because the marker declares `final_nrt=true` (`sc-builder.md` lines 10, 28; `role-tool-policies.json` line 52).
3. Do **not** bypass Pilot with raw `sc_eval`, `sc_run_file`, or any external/Python sidecar.
4. Do not claim completion without the governed trace (`sc-builder.md` line 29).

## Summary

Under `builder` + `final_nrt=true`, the callable scctl surfaces are `sc_run_probe`, `sc_render_nrt`, and the universal diagnostic tools. All raw runtime tools (`sc_eval`, `sc_run_file`, `sc_render`) are forbidden, as are external audio generation paths and direct candidate mutation. The final WAV must be rendered through `sc_render_nrt` after probe-based iteration.
