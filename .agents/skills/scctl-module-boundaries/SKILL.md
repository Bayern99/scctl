---
name: scctl-module-boundaries
description: Use when modifying scctl source code, adding imports across runtime transport workflow lab archive evals planner orchestration layers, or when unsure which module should own new SuperCollider pilot logic.
---

# scctl-module-boundaries

## Overview

supercollider-pilot splits responsibilities by layer. Code changes must stay in the owning module — see **AGENTS.md** §3 as canonical.

## When to Use

- Editing anything under `src/`
- Adding MCP tools or CLI commands
- Tempted to spawn `sclang` outside `src/runtime/`

When NOT to use: operating Pilot as user — use **scctl-governed-loop** or **scctl-operator-debug**.

## Layer map

| Layer | Path | Owns | Must not |
|-------|------|------|----------|
| Runtime | `src/runtime/*` | sclang, driver, protocol | lab/orchestration logic |
| Transport | `src/cli.ts`, `src/mcp/server.ts` | entry, JSON out | business orchestration |
| Harness | `src/harness/*` | tags, completion, roles | direct sclang |
| Workflow | `src/workflow/*` | plan/probe/summarize | spawn sclang |
| Lab | `src/lab/*` | candidates, probes | bypass driver |
| Archive | `src/archive/*` | JSONL archive | complex DB |
| Evals | `src/evals/*` | rubrics, grading | aesthetic judgment |
| Planner | `src/planner/*` | spec schema | art decisions |
| Orchestration | `src/orchestration/*` | handoff, KB snapshot | execute SC |

Detail: [`references/layer-map.md`](references/layer-map.md)

## Rules

1. Single file target 300–600 LOC; split before 800+.
2. New module → matching `tests/<area>/*.test.ts`.
3. Governance in `src/transport/governance.ts` + `src/harness/role-policies.ts`, not duplicated in skills.
4. Run `npm run typecheck && npm run build && npm test` before claiming code done.

## Common Mistakes

| Excuse | Reality |
|--------|---------|
| "Quick fix in cli.ts orchestration" | Orchestration belongs in `src/orchestration/` |
| "Driver can call archive directly" | Keep runtime thin |
| "Skill replaces AGENTS for coding" | AGENTS.md is canonical for repo edits |
