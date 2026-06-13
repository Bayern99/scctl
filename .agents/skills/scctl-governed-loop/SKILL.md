---
name: scctl-governed-loop
description: Use when closing SuperCollider audio tasks in scctl, claiming probe or render completion, choosing governed workflow vs raw MCP tools, or when .scctl/governed-role or SCCTL_GOVERNED_ROLE is active.
---

# scctl-governed-loop

## Overview

Governed SuperCollider work closes through Pilot orchestration and workflow tools, not raw runtime shortcuts. Hooks and RBAC enforce this when enabled; this skill covers judgment when they are not.

## When to Use

- User asks to "finish", "deliver", or "complete" an SC audio task
- Session has `.scctl/governed-role` or `SCCTL_GOVERNED_ROLE` set
- Task needs archive trail, audit, or candidate lifecycle
- Unsure whether to use `sc_eval` vs `prepare_handoff`

When NOT to use: one-off smoke test with explicit operator/debug intent — use **scctl-operator-debug**.

## Quick Reference

| Step | Tool / command | Notes |
|------|----------------|-------|
| 1 | `prepare_handoff` / `sc_prepare_handoff` | Writes `.scctl/governed-role`; injects `kb_snapshot` |
| 2 | `run_probe` / `sc_run_probe` | Builder path; not `sc_run_file` under RBAC |
| 3 | `summarize_session` | Before promotion decisions |
| 4 | `add_review` / `candidate_action` | Review gate |
| 5 | `audit_session` | Persists `session_audit`; required for closure |
| 6 | `memory_summary` | Cross-session summary |

Canonical docs: [`docs/operator-runbook.md`](../../../docs/operator-runbook.md) (governed loop), [`docs/design/route-enforcement-rules.md`](../../../docs/design/route-enforcement-rules.md).

## Session bootstrap

At session start, read `.scctl/governed-role` if present (hook injection may be unreliable). Respect `final_nrt` on the marker.

## Common Mistakes

| Excuse | Reality |
|--------|---------|
| "sc_eval is faster for completion" | Raw eval leaves no governed trace; use probe workflow |
| "I'll audit later" | `audit_session` is part of closure, not optional cleanup |
| "KB is long, I'll guess policies" | Read `kb_snapshot` from handoff or `docs/superpowers/kb/` |
| "sc_run_file equals probe" | Under governed builder, use `sc_run_probe` |

**REQUIRED:** Before claiming done, use **verification-before-completion** (typecheck/build/test only if you changed repo code).

See [`references/tool-routing.md`](references/tool-routing.md) for operator vs governed routing.
