# Tool routing (pointers only)

Do not copy allowlists here. Read canonical sources:

- Role policies: `docs/superpowers/kb/role-tool-policies.json` (loaded by `src/harness/role-policies.ts`)
- Role narratives: `docs/superpowers/roles/manager.md`, `sc-builder.md`, `sc-critic.md`
- Completion: `src/harness/completion-rules.ts`
- Task tags: `src/harness/policies.ts`

## Governed default chain

```text
prepare_handoff -> run_probe -> summarize_session -> (review/candidate_action) -> audit_session -> memory_summary
```

## Raw runtime (operator/debug)

`sc_eval`, `sc_run_file`, `sc_render`, `sc_render_nrt` — available by default; blocked when governed env or `.scctl/governed-role` + hooks/RBAC active.
