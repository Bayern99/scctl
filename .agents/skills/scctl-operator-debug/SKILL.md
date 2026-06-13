---
name: scctl-operator-debug
description: Use when smoke-testing sclang, debugging Pilot MCP locally, running sc_eval or sc_run_file for quick checks, or when SuperCollider engine health is unknown — not for claiming governed task completion.
---

# scctl-operator-debug

## Overview

Operator/debug mode uses raw runtime tools for fast feedback. It does not produce governed closure or archive-ready completion.

## When to Use

- `node dist/cli.js check` / `health` failing or unknown
- One-line `eval` sanity check
- Single `.scd` run without candidate lifecycle
- Draft `render` to listen (not final_nrt closure)

When NOT to use: user asked to **complete** a governed SC task — use **scctl-governed-loop**.

## Quick Reference

| Intent | Prefer | task_tag (optional) |
|--------|--------|---------------------|
| Inline test | `eval` / `sc_eval` | — |
| Run file once | `run` / `sc_run_file` | `sc-probe` |
| Draft WAV | `render` / `sc_render` | `sc-audio-generation` |
| Final WAV (operator) | `render-nrt` / `sc_render_nrt` | `sc-audio-generation` |

Full command reference: [`docs/operator-runbook.md`](../../../docs/operator-runbook.md)

## Rules

1. Default (no `SCCTL_GOVERNED_ROLE`): raw tools are **not blocked**.
2. Supply `task_tag` when comparing compliance snapshots.
3. Never tell the user a governed task is **done** after operator-only paths.
4. Recovery: `reset` → `reboot` → `reclaim` (see runbook recovery table).

## Common Mistakes

| Excuse | Reality |
|--------|---------|
| "Smoke passed so task is complete" | Compliance ≠ governed closure |
| "I'll skip task_tag for speed" | You lose compliance evidence |
| "Governed mode is on but eval is fine" | RBAC/hooks may block raw tools |
