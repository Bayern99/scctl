# Draft vs Final Decision — Quick 3-second timbre preview

## Decision

Use **`sc_render`** (the draft render path).

## Rationale

- The user explicitly asks for a **draft WAV** for a quick listen: "just render me a 3-second draft WAV so I can hear if this timbre is worth pursuing."
- This is **early exploration / iteration**, not final delivery, audit closure, or a task declaring `final_nrt` / `quality.render_tier: final_nrt`.
- Per `scctl-draft-vs-final`:
  - "Draft listen during iteration is allowed; do not submit draft path as final artifact."
  - "When NOT to use [NRT]: quick listen during exploration — draft is fine if you do not claim final closure."

## Closure expectations

1. **Treat the output as an exploratory preview only.** Do not present the draft WAV as a completed deliverable or final artifact.
2. **Do not run `audit_session` or claim task closure** against this draft render. No final-audit trail should be generated from a 3-second timbre check.
3. **If the timbre is approved and the work moves to final render**, switch to **`sc_render_nrt`** (or a governed NRT probe) and satisfy `final_nrt` requirements:
   - Absolute `.scd` source path and absolute output path.
   - NRT source returns `Event`/`Dictionary` with `\score` and `\duration`.
   - Record `summarize_session` and complete `audit_session` where governed.
4. **If governed mode already enforces `final_nrt`** for this task, `sc_render` would be rejected by RBAC/hooks. In that case, reframe the request as a no-closure probe/listen, or route it through the proper NRT workflow from the start.
