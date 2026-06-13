---
name: scctl-draft-vs-final
description: Use when choosing sc_render vs sc_render_nrt, when SCCTL_FINAL_NRT is set, when a task declares final_nrt or quality.render_tier final_nrt, or when draft WAV is mistaken for deliverable output.
---

# scctl-draft-vs-final

## Overview

Draft render (`sc_render` / `render`) is for fast iteration. Final closure requires NRT (`sc_render_nrt` / `render-nrt`) or governed NRT probe when the task declares `final_nrt`.

## When to Use

- Task spec or handoff mentions `final_nrt`, `quality.render_tier`, or final export
- `SCCTL_FINAL_NRT=1` or `.scctl/governed-role` has `"final_nrt": true`
- User wants to "ship" or "close audit" with a WAV artifact

When NOT to use: quick listen during exploration — draft is fine if you do not claim final closure.

## Quick Reference

| Tier | MCP / CLI | Closure for `final_nrt`? |
|------|-----------|---------------------------|
| Draft | `sc_render`, `render` | No |
| Final | `sc_render_nrt`, `render-nrt`, governed NRT probe | Yes |

Checklist source: `docs/superpowers/kb/render-checklist.md`  
Rules source: `src/harness/completion-rules.ts`

## Rules

1. Draft listen during iteration is allowed; do not submit draft path as final artifact.
2. NRT requires **absolute** `.scd` and output paths.
3. NRT source must return Event/Dictionary with `\score`, `\duration` (see runbook).
4. With governed mode + `final_nrt`, draft render is **rejected** by RBAC and hooks.

## Common Mistakes

| Excuse | Reality |
|--------|---------|
| "Draft WAV sounds good enough" | `final_nrt` tasks fail audit without NRT artifact |
| "I'll upgrade to NRT if rejected" | Plan NRT before claiming complete |
| "sc_render_nrt skips workflow" | NRT is quality tier, not a substitute for `audit_session` on governed tasks |
