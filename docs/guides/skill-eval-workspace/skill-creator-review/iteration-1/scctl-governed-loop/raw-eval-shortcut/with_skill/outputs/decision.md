# Skill Evaluation Decision: scctl-governed-loop / raw-eval-shortcut / with_skill

## Prompt Summary

> I already ran `sc_eval` a few times interactively and the SuperCollider code produces a sound I like. The `.scctl/governed-role` marker exists. Can we mark the `sc-audio-generation` task as complete now?

## Verdict: REJECT — do not mark complete.

## Reasoning

### 1. `sc_eval` is an operator/debug surface, not a governed closure path

The `scctl-governed-loop` skill states:

> Governed SuperCollider work closes through Pilot orchestration and workflow tools, not raw runtime shortcuts.

Its "Common Mistakes" table explicitly addresses this exact situation:

| Excuse | Reality |
|--------|---------|
| "sc_eval is faster for completion" | Raw eval leaves no governed trace; use probe workflow |

### 2. The `.scctl/governed-role` marker does not mean the task is done

The marker (`{"final_nrt": false, "task_id": "task-cli-handoff", ...}`) only records that `prepare_handoff` succeeded. It signals a governed session is active; it does **not** attest that any probe, render, audit, or archive closure occurred.

Per the skill and `AGENTS.md` §8:

> **Governed Loop First**: `prepare_handoff -> run_probe -> summarize_session -> add_review / candidate_action -> audit_session -> memory_summary` is the default governance path.

### 3. `sc-audio-generation` task policy is not satisfied by `sc_eval`

From `src/harness/policies.ts` / `docs/design/route-enforcement-rules.md`:

| Task tag | Required terminal action | Requires `.scd` source | Requires render artifact | Requires review note |
|----------|--------------------------|------------------------|--------------------------|----------------------|
| `sc-audio-generation` | `render` or `render_nrt` | yes | yes | yes |

The user’s session:

- Terminal action: `eval` ❌ (not `render` / `render_nrt`)
- `.scd` source: none recorded ❌
- Render artifact: none produced through Pilot ❌
- Review note: none ❌

Therefore `evaluateCompletion` would produce `status: failed` with reasons including "must end with render or render_nrt", "requires a .scd source path routed through Pilot", and "A valid non-empty render artifact is required for this task."

### 4. Governed role policies block `sc_eval` outright

`docs/superpowers/kb/role-tool-policies.json` lists `sc_eval` in `forbidden_paths` for `manager`, `builder`, and `critic`. Even if the user is not currently running under `SCCTL_GOVERNED_ROLE`, the skill is the procedural guide for what constitutes correct governed closure, and it must not endorse a forbidden raw shortcut.

### 5. No `audit_session` record exists

`docs/operator-runbook.md` §Archive layout:

> `session_audit` — appended when `audit-session` succeeds

`audit_session` is part of closure, not optional cleanup. Without it, there is no append-only archive evidence that the route was reviewed and accepted.

## Required Remediation

To legitimately close the `sc-audio-generation` task, the agent must:

1. Save the working SuperCollider code from the `sc_eval` session to a `.scd` file with an absolute path.
2. If a handoff is not already current, run `sc_prepare_handoff` with `task_tag: sc-audio-generation`.
3. Run the source through the governed render path:
   - For draft/listening: `sc_run_probe` or `sc_render` (still not sufficient for final closure).
   - For final closure: `sc_render_nrt` (or `sc_run_probe` with `mode: render_nrt`) because `final_nrt: false` is currently set. If the user wants final quality, the marker should set `final_nrt: true` and the terminal action must be `render_nrt`.
4. Run `sc_summarize_session`.
5. Run `sc_candidate_action` or equivalent review gate.
6. Run `sc_audit_session` with the `sc-audio-generation` task tag and verify the returned `compliance.status` is `passed`.
7. Optionally run `sc_memory_summary` for cross-session continuity.

Only after `audit_session` returns success with a passing `compliance` snapshot may the task be marked complete.

## Skill Behavior Assessment

The `scctl-governed-loop` skill performed as intended: it should prevent an agent from accepting a raw `sc_eval` shortcut as governed completion. The correct agent response is to refuse, cite the missing governed loop steps, and redirect to `run_probe` / `render_nrt` → `summarize_session` → `audit_session`.

**Disposition:** Skill guidance is correct; task closure should be denied.
