# Decision: Can `sc-audio-generation` be marked complete after interactive `sc_eval`?

**Verdict:** No. The task is **not complete**.

## Why the current evidence is insufficient

1. **Wrong terminal action for the task tag.**
   `sc-audio-generation` must end with `render` or `render_nrt` (`src/harness/policies.ts`).
   `sc_eval` is an operator/debug surface, not a terminal action that can close this task.

2. **No `.scd` source path was routed through Pilot.**
   The task policy requires a `.scd` source. Interactive `sc_eval` takes inline code, so the required `source_kind: scd_file` evidence is missing.

3. **No verifiable render artifact exists.**
   `sc-audio-generation` requires a valid, non-empty WAV render artifact. `sc_eval` does not produce one.

4. **No review note is attached.**
   The policy also requires a review note. Liking the sound is subjective listener feedback; it is not a recorded review bound to a probe, candidate, or audit record.

5. **The `.scctl/governed-role` marker is not completion evidence.**
   The marker currently contains:

   ```json
   {
     "final_nrt": false,
     "task_id": "task-cli-handoff",
     "prepared_at": "2026-06-13T12:23:13.873Z"
   }
   ```

   It only signals that a handoff was prepared so that IDE hooks and preflight scripts know the session is governed. It does **not** prove the route was satisfied, the artifact was rendered, or a review was recorded.

6. **In governed roles, raw `sc_eval` is the wrong path.**
   `docs/superpowers/kb/role-tool-policies.json` lists `sc_eval` under forbidden paths for `manager`, `builder`, and `critic`. Even when the marker exists, the governed creative loop expects workflow/orchestration tools, not raw runtime tools.

## What would satisfy completion

Use one of the Pilot terminal actions with the `sc-audio-generation` task tag and supply the missing evidence:

```bash
# Draft path
node dist/cli.js render /absolute/path/to/source.scd -o /absolute/path/to/output.wav -d 5 --task-tag sc-audio-generation

# Final-quality path
node dist/cli.js render-nrt /absolute/path/to/final-nrt.scd -o /absolute/path/to/final.wav --task-tag sc-audio-generation
```

Then, because this is a governed session, close the loop through the archive:

```text
prepare-handoff -> run-probe -> summarize-session -> candidate-action / add-review -> audit-session -> memory-summary
```

## References

- `src/harness/policies.ts` — canonical task policy for `sc-audio-generation`
- `src/harness/completion-rules.ts` — how a `ComplianceSnapshot` is evaluated
- `docs/design/route-enforcement-rules.md` — route enforcement and required evidence
- `docs/superpowers/status.md` — governed loop and raw-runtime-tool intent
- `docs/operator-runbook.md` — operator/debug vs governed surfaces and draft vs final NRT
