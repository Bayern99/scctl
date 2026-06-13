---
name: scctl-role-handoff
description: Use when SCCTL_GOVERNED_ROLE is manager, builder, or critic, when reading .scctl/governed-role after prepare_handoff, or when unsure which MCP tools a narrow role may call.
---

# scctl-role-handoff

## Overview

Narrow roles have explicit tool allowlists. Read canonical role docs and policy JSON — do not guess from memory.

## When to Use

- `SCCTL_GOVERNED_ROLE` is set in env
- `.scctl/governed-role` exists after handoff
- Switching between manager / builder / critic responsibilities

## Quick Reference

| Role | Doc | Typical focus |
|------|-----|---------------|
| manager | `docs/superpowers/roles/manager.md` | handoff, audit, memory |
| builder | `docs/superpowers/roles/sc-builder.md` | `sc_run_probe`, NRT when declared |
| critic | `docs/superpowers/roles/critic.md` | review, no raw runtime |

Policy JSON (canonical): `docs/superpowers/kb/role-tool-policies.json`  
Loader: `src/harness/role-policies.ts`

## Rules

1. Read the role markdown **and** policy for the active role.
2. `final_nrt: true` on marker or `SCCTL_FINAL_NRT` switches builder policy variant.
3. If tool call fails with governance_violation, fix route — do not retry forbidden raw tool.
4. Handoff packet may include `role_packets`; prefer that over inventing scope.

## Common Mistakes

| Excuse | Reality |
|--------|---------|
| "Builder can run any SC tool" | Builder forbids raw eval/run/render by default |
| "Critic can render to judge quality" | Critic uses review tools, not runtime |
| "I'll copy allowlist into chat" | Read live JSON; policies evolve |
