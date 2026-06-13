# Decision: Can the draft WAV close a `final_nrt` task?

**No.** The task cannot be closed with the draft WAV.

## Reasoning

The skill `scctl-draft-vs-final` and project policy are explicit on this point:

- `sc_render` / `render` is the **draft** tier, intended only for fast iteration and quick listens.
- `sc_render_nrt` / `render-nrt` is the **final-quality** tier.
- When the governed marker or task spec declares `final_nrt=true`, closure requires an NRT artifact.

> "Draft vs Final Split: `sc_render` is draft path; `sc_render_nrt` is final-quality path. Declaring `final_nrt` tasks cannot use draft artifact to close." — `AGENTS.md`

> "`final_nrt` tasks fail audit without NRT artifact" — `scctl-draft-vs-final` skill Common Mistakes

In governed mode with `final_nrt`, a draft render is rejected by RBAC and hooks. "Sounds good enough" is not a valid reason to bypass the final-quality path.

## What to do instead

1. Do **not** submit the draft WAV as the deliverable.
2. Run the composition through the final-quality path using `sc_render_nrt` (MCP tool) or `scctl render-nrt <file>` (CLI).
3. Ensure the source `.scd` file uses absolute paths and returns an Event/Dictionary with `\score` and `\duration`, as required by NRT.
4. Verify the rendered NRT WAV artifact exists and is non-empty.
5. Record a `summarize_session` result before closure.
6. Add an explicit review note before promoting the artifact as final.
7. Run `audit_session` if the task is governed.

Only the NRT-rendered WAV may be used to close a task marked `final_nrt=true`.
