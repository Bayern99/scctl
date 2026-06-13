# Decision: Quick 3-Second Timbre Draft

## Decision

Use **`sc_render`** (the draft render path).

Do **not** use `sc_render_nrt` for this request.

## Rationale

The user explicitly asked for a **short, disposable listen-test** to decide whether a timbre is "worth pursuing." This is the canonical use case for the draft tier:

- `sc_render` is the **draft / fast-listen** runtime surface (`docs/operator-runbook.md`: "Fast listen / iteration → `render` / `sc_render` → draft").
- `sc_render_nrt` is the **final-quality NRT** surface, intended for audited closure of tasks that declare `quality.render_tier: final_nrt` (`AGENTS.md` §8.5; `docs/superpowers/status.md`).
- A 3-second preview is an early exploration artifact, not a final deliverable. Running NRT would waste fidelity-oriented overhead on a throwaway decision.

## Closure Expectations

1. **Artifact tier**: The WAV is a **draft**. Label it as such in any metadata or conversation summary.
2. **No route closure**: This render does **not** close a Pilot task. If a task tag such as `sc-audio-generation` is present, the compliance snapshot will show a draft artifact, which is insufficient for `final_nrt` closure (`route-enforcement-rules.md`).
3. **Next step gate**: After listening, the user must either:
   - reject/abandon the timbre, or
   - pursue it through the governed loop (`prepare_handoff → run_probe → ...`) and eventually use `sc_render_nrt` if the task requires final-quality output.
4. **Operator/debug context**: This is a raw runtime call. It is appropriate for operator/debug workflows but should not be represented as a governed creative outcome.

## Caveats

- If the session is in governed mode (`SCCTL_GOVERNED_ROLE` set) **and** `SCCTL_FINAL_NRT=1` is active, raw `sc_render` may be blocked. In that case, the user should either drop into operator/debug mode or route the request through a governed `sc-probe` that can emit a short draft/listen artifact.
- Do not commit generated `.wav` files or archive entries from a quick draft unless the user explicitly promotes it to a probe/candidate.

## References

- `AGENTS.md` §8.5: Draft vs Final Split
- `docs/operator-runbook.md`: "Draft vs final NRT" table and operator/debug vs governed surfaces
- `docs/superpowers/status.md`: Raw runtime tools and `final_nrt` closure rule
- `docs/design/route-enforcement-rules.md`: Task tags and soft/hard compliance model
