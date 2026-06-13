---
name: scctl-probe-lifecycle
description: Use when running sc probes, creating or reviewing candidates, writing archive review notes, or following probe to summarize to candidate_action to audit_session in scctl lab workflows.
---

# scctl-probe-lifecycle

## Overview

Probes explore sound hypotheses; candidates and reviews turn probes into governed archive assets. Closure requires summarize + audit, not a lone probe run.

## When to Use

- `sc-probe` task tag
- `run_probe` / lab probe specs
- promote, reject, or review candidate
- reading `.scctl/archive/` history

Design docs: [`docs/design/primitive-lab-spec.md`](../../../docs/design/primitive-lab-spec.md), [`docs/design/candidate-lifecycle.md`](../../../docs/design/candidate-lifecycle.md)

## Quick Reference

| Stage | Tool | Archive kind |
|-------|------|--------------|
| Probe | `run_probe` / `sc_run_probe` | `probe_run` |
| Summarize | `summarize_session` | `session_summary` |
| Review | `add_review` | `review_note` |
| Candidate | `candidate_action` | `candidate_lifecycle` |
| Audit | `audit_session` | `session_audit` |

KB lists: `docs/superpowers/kb/allowed-primitives.md`, `known-failures.md`

## Rules

1. Probes use absolute paths to `.scd` under `sc/families/` when possible.
2. Append-only archive — do not rewrite history.
3. Promotion-style decisions need review note (see task tag policy).
4. Pair with **scctl-governed-loop** for full session orchestration.

## Common Mistakes

| Excuse | Reality |
|--------|---------|
| "Probe passed so promote immediately" | Need summarize + review gate |
| "Skip candidate registry" | Lifecycle is append-only evidence |
| "Audit optional for probes" | `session_audit` persists closure record |
