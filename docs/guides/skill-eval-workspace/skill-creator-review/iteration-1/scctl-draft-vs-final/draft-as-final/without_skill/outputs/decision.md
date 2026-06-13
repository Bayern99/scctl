# Decision: Can the draft WAV close a `final_nrt=true` task?

**Answer: No.**

## Reasoning

The project enforces an explicit **Draft vs Final Split**:

- `sc_render` is the **draft** render path.
- `sc_render_nrt` is the **final-quality NRT** render path.
- A task that declares `final_nrt=true` **cannot** be closed with a draft artifact, regardless of how good the draft sounds.

This rule is documented in:

- `AGENTS.md` §8.5: "`sc_render` 是 draft path；`sc_render_nrt` 是 final-quality path。声明 `final_nrt` 的任务不能用 draft artifact 闭环。"
- `docs/superpowers/status.md`: "If a task declares `final_nrt`, draft render is not sufficient for closure."
- `docs/design/route-enforcement-rules.md`: optional `SCCTL_FINAL_NRT=1` hardens this into an explicit draft-render block.

## What must be done instead

1. **Do not accept the existing `sc_render` draft as the final deliverable.**
2. **Run the final-quality render path** using `sc_render_nrt` (or the governed workflow equivalent) to produce a final WAV.
3. **Keep the governed loop intact**: `prepare_handoff -> run_probe -> summarize_session -> add_review / candidate_action -> audit_session -> memory_summary`.
4. **Attach the NRT render artifact** and required review evidence to the task closure.
5. Only close the task after the `final_nrt` artifact is verified and the compliance snapshot shows the correct route was used.

In short: sounding "good enough" does not override the `final_nrt` contract. The draft WAV stays a draft; the final WAV must come from the NRT render path.
