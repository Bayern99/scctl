# Governed `final_nrt` closure for `sc-audio-generation`

## Situation

- We are already inside a governed session: `.scctl/governed-role` shows `final_nrt=true`.
- Task tag is `sc-audio-generation`.
- Goal: finish and deliver a final WAV.

Because the marker is present, `sc_prepare_handoff` has already run and injected the KB/role packets. The remaining work is to render the final artifact through the governed surface and close the loop with an audit trail.

## Exact tool sequence

| # | MCP tool | CLI equivalent | Why it is required |
|---|----------|----------------|--------------------|
| 1 | `sc_run_probe` | `node dist/cli.js run-probe --spec '<json>'` | Produces the **final NRT WAV** and writes a `probe_run` archive record with `render_mode: "nrt"`. The raw `sc_render_nrt` tool would render but would **not** create the required `probe_run` archive entry, so `sc_audit_session` would miss the required `sc_run_probe` step. |
| 2 | `sc_summarize_session` | `node dist/cli.js summarize-session --input '<json>'` | Writes the `session_summary` archive record. `sc_audit_session` fails without it. |
| 3 | `sc_candidate_action` (`create_draft`) | `node dist/cli.js candidate-action --input '<json>'` | Creates a candidate linked to the final NRT probe. Optional only if a candidate already exists. |
| 4 | `sc_candidate_action` (`add_review`) | `node dist/cli.js candidate-action --input '<json>'` | Records an explicit review note. `sc-audio-generation` **requires** a review note per the task-tag policy (`route-enforcement-rules.md`). |
| 5 | `sc_candidate_action` (`accept`) | `node dist/cli.js candidate-action --input '<json>'` | Promotes the candidate to `accepted`, making the final WAV the governed deliverable. Requires an explicit review note (enforced by the workflow layer). |
| 6 | `sc_audit_session` | `node dist/cli.js audit-session --input '<json>'` | Validates path compliance, NRT artifact presence, summary, and review gate; appends `session_audit`. This is the governed closure evidence. |
| 7 | `sc_memory_summary` | `node dist/cli.js memory-summary --limit 10` | Closes the default loop and preserves a memory excerpt for the next handoff. |

## What must NOT be done

- Do **not** close on `sc_render` (draft). For a `final_nrt` task the audit `artifact_completion` check fails if only a draft render artifact exists.
- Do **not** bypass `sc_run_probe` and call `sc_render_nrt` directly as the final step. The WAV would exist, but the archive would lack the `probe_run` record the audit uses to prove Pilot route compliance.
- Do **not** skip `sc_summarize_session` or the review note. Both are hard gates for `sc-audio-generation` in `src/harness/completion-rules.ts` / `src/orchestration/service.ts`.

## Example calls

### 1. Final NRT render probe

```json
{
  "spec": {
    "id": "final-nrt-render-1",
    "title": "Final NRT render",
    "question": "Does the final NRT render produce the requested WAV?",
    "mode": "render_nrt",
    "file_path": "/absolute/path/to/final.scd",
    "render": {
      "out_path": "/absolute/path/to/output/final.wav",
      "duration_sec": 60
    },
    "tags": ["sc-audio-generation"]
  }
}
```

MCP: `sc_run_probe` with the spec above.  
CLI:

```bash
node dist/cli.js run-probe --spec '{
  "id": "final-nrt-render-1",
  "title": "Final NRT render",
  "question": "Does the final NRT render produce the requested WAV?",
  "mode": "render_nrt",
  "file_path": "/absolute/path/to/final.scd",
  "render": { "out_path": "/absolute/path/to/output/final.wav", "duration_sec": 60 },
  "tags": ["sc-audio-generation"]
}'
```

Capture `payload.probe_run.session_id` and `payload.probe_run.artifacts[0].path`. Verify `success: true` and that the WAV file is non-empty.

### 2. Summarize the session

```json
{
  "session_id": "<session_id_from_probe>",
  "task": "sc-audio-generation final NRT deliverable",
  "outcome": "success",
  "preserved_items": [
    "final_nrt WAV: /absolute/path/to/output/final.wav",
    "candidate_id: cand-final-1"
  ],
  "failures": [],
  "notes": ["Rendered final WAV via NRT from /absolute/path/to/final.scd"],
  "probe_id": "final-nrt-render-1"
}
```

### 3. Create candidate (if needed)

```json
{
  "session_id": "<session_id>",
  "action": "create_draft",
  "candidate_id": "cand-final-1",
  "name": "final-nrt-piece",
  "source_probe_id": "final-nrt-render-1",
  "summary": "Final NRT render accepted as deliverable."
}
```

### 4. Add review

```json
{
  "session_id": "<session_id>",
  "action": "add_review",
  "candidate_id": "cand-final-1",
  "review": {
    "reviewer": "critic",
    "verdict": "keep",
    "summary": "Final NRT WAV meets the brief; artifact verified and non-empty."
  }
}
```

### 5. Accept candidate

```json
{
  "session_id": "<session_id>",
  "action": "accept",
  "candidate_id": "cand-final-1",
  "review": {
    "reviewer": "critic",
    "verdict": "keep",
    "summary": "Approved for delivery."
  }
}
```

### 6. Audit

```json
{
  "session_id": "<session_id>",
  "task_tag": "sc-audio-generation",
  "candidate_id": "cand-final-1",
  "quality": { "render_tier": "final_nrt" }
}
```

The audit must report:

- `path_compliance.status`: `pass`
- `artifact_completion.status`: `pass`
- `summary_present.status`: `pass`
- `review_gate.status`: `pass`
- `recommended_next_step`: `archive`

### 7. Memory summary

```bash
node dist/cli.js memory-summary --limit 10
```

## Deliverable

The final deliverable is the WAV path returned by the NRT probe:

```text
/absolute/path/to/output/final.wav
```

It is valid for governed closure only after `sc_audit_session` succeeds and writes the `session_audit` record to `.scctl/archive/archive-events.jsonl`.
