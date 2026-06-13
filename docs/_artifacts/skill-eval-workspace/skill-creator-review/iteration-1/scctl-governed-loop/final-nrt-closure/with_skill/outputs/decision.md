# Final-NRT Closure Decision — `scctl-governed-loop`

## Scenario restatement

- Session is already governed: `.scctl/governed-role` exists and shows `final_nrt=true`.
- Task tag is `sc-audio-generation`.
- Goal: finish the task and deliver a final-quality WAV.

Because the marker is already present, `sc_prepare_handoff` was the session bootstrap and is **not repeated** during closure. The closure sequence must respect the marker: draft renders (`sc_render`) are forbidden, and the audit will require an NRT render artifact.

## Exact tool sequence

| # | MCP tool | CLI command | Purpose |
|---|----------|-------------|---------|
| 1 | `sc_run_probe` | `run-probe --spec '<json>'` | Execute the final-quality NRT render through the governed probe layer. |
| 2 | `sc_candidate_action` (create_draft) | `candidate-action --input '<json>'` | Promote the successful probe result into a candidate. |
| 3 | `sc_summarize_session` | `summarize-session --input '<json>'` | Write the session outcome before audit. |
| 4 | `sc_candidate_action` (accept) | `candidate-action --input '<json>'` | Add an explicit review note and accept the candidate as final. |
| 5 | `sc_audit_session` | `audit-session --input '<json>'` | Formally verify the governed trace and persist `session_audit`. |
| 6 | `sc_memory_summary` | `memory-summary --session-id <id>` | Aggregate cross-session memory. |

## Step details and rationale

### 1. `sc_run_probe` in `render_nrt` mode

This is the only governed step that both produces the final WAV **and** leaves the archive evidence the audit will look for.

**Why not `sc_render_nrt` directly?** Under `final_nrt=true` the builder role allowlist does permit `sc_render_nrt`, but calling it directly skips the `probe_run` archive record. `sc_audit_session` evaluates path compliance from archive records; without a `probe_run` step the audit fails. `sc_run_probe` with `mode: "render_nrt"` calls the same NRT driver internally and records a render artifact with `render_mode: "nrt"`.

**Why not `sc_render`?** Draft render is globally forbidden when `final_nrt=true` (`final_nrt_global_forbidden: ["sc_render"]`) and would not satisfy the `sc-audio-generation` final-quality policy.

**Example payload (MCP):**

```json
{
  "spec": {
    "id": "final-nrt-1",
    "title": "Final NRT render for delivery",
    "question": "Does the NRT render produce a complete, verifiable final WAV?",
    "mode": "render_nrt",
    "file_path": "/absolute/path/to/final-nrt.scd",
    "render": {
      "out_path": "/absolute/path/to/output/final.wav",
      "duration_sec": 120,
      "engine_preference": "auto",
      "sample_format": "float"
    },
    "tags": ["sc-audio-generation"]
  }
}
```

**Equivalent CLI:**

```bash
node dist/cli.js run-probe --spec '{"id":"final-nrt-1","title":"Final NRT render for delivery","question":"Does the NRT render produce a complete, verifiable final WAV?","mode":"render_nrt","file_path":"/absolute/path/to/final-nrt.scd","render":{"out_path":"/absolute/path/to/output/final.wav","duration_sec":120,"engine_preference":"auto","sample_format":"float"},"tags":["sc-audio-generation"]}'
```

Capture the returned `session_id` and the `probe_run.artifacts` list for the next steps.

### 2. `sc_candidate_action` — create draft

Convert the probe result into a named candidate so the final artifact can be reviewed and accepted.

**Why necessary:** `sc-audio-generation` requires a review note, but the audit only enforces the review gate when the workflow is classified as `candidate_promotion`. Creating a candidate shifts the workflow from `render_qa` to `candidate_promotion`, which makes the review gate mandatory and lets the artifact be formally accepted.

**Example payload:**

```json
{
  "session_id": "<session_id_from_probe>",
  "action": "create_draft",
  "candidate_id": "cand-final-nrt-1",
  "name": "final-nrt-piece",
  "source_probe_id": "final-nrt-1",
  "summary": "Final NRT render candidate ready for review.",
  "artifacts": [
    {
      "kind": "render",
      "path": "/absolute/path/to/output/final.wav",
      "render_mode": "nrt"
    }
  ]
}
```

### 3. `sc_summarize_session`

Write the session summary into the append-only archive before any promotion decision.

**Why necessary:** `sc_audit_session` explicitly checks for a `session_summary` record and fails if it is missing. The summary also feeds `memory_summary` later.

**Example payload:**

```json
{
  "session_id": "<session_id_from_probe>",
  "task": "sc-audio-generation final NRT delivery",
  "outcome": "success",
  "preserved_items": [
    "candidate:cand-final-nrt-1",
    "/absolute/path/to/output/final.wav"
  ],
  "failures": [],
  "notes": ["Final NRT render passed verification."],
  "probe_id": "final-nrt-1"
}
```

### 4. `sc_candidate_action` — accept with review

Add an explicit review note and accept the candidate in one governed call.

**Why necessary:** The review note satisfies the `sc-audio-generation` review requirement. `accept` moves the candidate to terminal `accepted` status, which tells the audit that the artifact is cleared for delivery. `candidate_action` calls `add_review` internally before applying the lifecycle transition, producing both the `review_note` and `candidate_lifecycle` records the audit expects.

**Example payload:**

```json
{
  "session_id": "<session_id_from_probe>",
  "action": "accept",
  "candidate_id": "cand-final-nrt-1",
  "summary": "Accept final NRT artifact for delivery.",
  "review": {
    "reviewer": "critic",
    "verdict": "keep",
    "summary": "Final WAV is complete and meets the governed final-nrt quality gate."
  }
}
```

### 5. `sc_audit_session`

Run the formal closure audit.

**Why necessary:** Auditing is part of closure, not optional cleanup. It verifies:

- Path compliance: the trace used only allowed governed tools (`sc_run_probe`, `sc_summarize_session`, `sc_candidate_action`).
- Artifact completion: an NRT render artifact is present (not a draft).
- Summary present: `sc_summarize_session` was called.
- Review gate: an explicit review note exists because the workflow is `candidate_promotion`.

Pass `quality.render_tier: "final_nrt"` so the audit knows to require an NRT artifact rather than any render artifact.

**Example payload:**

```json
{
  "session_id": "<session_id_from_probe>",
  "task_tag": "sc-audio-generation",
  "candidate_id": "cand-final-nrt-1",
  "quality": {
    "render_tier": "final_nrt"
  }
}
```

A successful audit returns `recommended_next_step: "archive"` and appends a `session_audit` record.

### 6. `sc_memory_summary`

Compute the project-level memory summary from the archive.

**Why necessary:** It is the last step of the canonical governed loop and provides the cross-session context the next governed task will use. It does not mutate the archive beyond reading it.

**Example payload:**

```json
{
  "session_id": "<session_id_from_probe>",
  "limit": 10
}
```

## What must not be used

| Tool | Why it is wrong here |
|------|----------------------|
| `sc_eval` | Raw runtime; leaves no governed trace; blocked under governed builder role. |
| `sc_run_file` | Raw runtime; not an archived probe; blocked under governed builder role. |
| `sc_render` | Draft render; explicitly forbidden when `final_nrt=true`; cannot close a final-quality task. |
| `sc_render_nrt` directly | Allowed by role policy but skips the `probe_run` archive record, causing audit path compliance to fail. Use only if the manager explicitly requests a retry outside the probe workflow. |

## Verification-before-completion note

No repository source files are changed during this closure, so `npm run typecheck`, `npm run build`, and `npm test` are not required for the closure itself. If the underlying `.scd` or project code was modified earlier, those checks should have passed before entering this closure sequence.

## Summary

The governed closure for `sc-audio-generation` with `final_nrt=true` is:

```text
sc_run_probe (render_nrt)
  → sc_candidate_action (create_draft)
  → sc_summarize_session
  → sc_candidate_action (accept + review)
  → sc_audit_session
  → sc_memory_summary
```

This sequence produces the final WAV, archives the NRT render evidence, creates and accepts a candidate, satisfies the review gate, and passes the formal audit — which is the only way the task can be honestly declared finished under a governed SuperCollider session.
