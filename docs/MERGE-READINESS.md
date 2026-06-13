# Merge readiness — `codex/agent-harness-narrow-roles` → `main`

Checklist before opening or merging the integration PR. **Do not merge until all required items pass.**

## Branch scope

7 commits ahead of `main` (runtime NRT → harness/workflow → orchestration → governance → skills/docs).

```bash
git log main..HEAD --oneline
npm run typecheck && npm run build && npm test
node scripts/harness-audit.js repo
```

Optional with local SuperCollider: `npm run test:live`

## Required before merge

- [ ] CI green on the branch (`gh pr checks` after PR opened)
- [ ] [CHANGELOG.md](../CHANGELOG.md) `[Unreleased]` reviewed; bump version on merge if releasing (suggest `1.1.0` minor — new MCP/workflow surface, backward-compatible CLI)
- [ ] [docs/superpowers/status.md](superpowers/status.md) matches shipped behavior
- [ ] No secrets or `.env` in diff
- [ ] Consumer bootstrap smoke: `scripts/bootstrap-consumer-project.sh $(mktemp -d)` succeeds

## PR hygiene

```bash
gh pr create --base main --head codex/agent-harness-narrow-roles \
  --title "feat: agent harness, governance, and consumer bootstrap" \
  --body-file - <<'EOF'
## Summary
- Phase 7 workflow, orchestration, opt-in RBAC, IDE hooks
- Phase 7.2 agent skills + consumer bootstrap script/docs

## Test plan
- [ ] CI
- [ ] npm test
- [ ] harness-audit repo scope
EOF
```

## What ships vs what stays reference-only

| Ships (runtime + ops) | Reference only |
|----------------------|----------------|
| `src/`, `hooks/`, `scripts/harness-audit.js`, `scripts/bootstrap-consumer-project.sh` | `docs/design/zhouyi-*` (consumer context) |
| `.agents/skills/scctl-*`, `docs/superpowers/kb/` | `docs/guides/skill-eval-workspace/` (eval artifacts) |
| `docs/guides/consumer-bootstrap.zh-CN.md`, runbooks | `docs/design/agent-harness-research-*.md` |

Zhou Yi / harness research docs **may** land on `main` as design reference; they do not activate Zhou Yi runtime in this repo.

## Repo layout (general practice)

```text
src/              TypeScript product code
tests/            Vitest (mirror src layout)
hooks/            IDE hook scripts (Cursor-compatible)
.agents/skills/   Agent-neutral project skills
.cursor/          IDE-only config (e.g. hooks.json)
docs/
  guides/         Human + agent onboarding (bootstrap, tutorial)
  design/         Architecture & research
  superpowers/    KB, roles, plans, status
sc/               SuperCollider starter families
scripts/          harness-audit, consumer bootstrap
```

## License

[LICENSE](../LICENSE) — ISC, Copyright (c) 2026 Jerry Duan. No change required for this merge unless ownership changes.

## After merge (release optional)

1. Tag `v1.1.0` if publishing a GitHub release
2. Move `[Unreleased]` in CHANGELOG to `[1.1.0] - YYYY-MM-DD`
3. `npm publish` only if `package.json` `files` includes needed bootstrap assets (see `package.json`)
