# Contributing to supercollider-mcp

Thank you for your interest in contributing.

## Development setup

```bash
git clone https://github.com/Bayern99/supercollider-mcp.git
cd supercollider-mcp
npm install
npm run build
node dist/cli.js check   # requires SuperCollider installed
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check `src/` and `tests/` |
| `npm test` | Run Vitest suite (38 tests) |
| `npm run test:watch` | Watch mode |

## Pull request process

1. Fork the repository and create a feature branch from `main`
2. Make focused changes; match existing code style
3. Ensure `npm run typecheck`, `npm run build`, and `npm test` pass locally
4. Update `CHANGELOG.md` under `[Unreleased]` for user-visible changes
5. Open a PR with a clear description and test plan

## Commit messages

Use concise, imperative subject lines:

- `feat: add sc_foo MCP tool`
- `fix: reject hung execute on stop`
- `docs: clarify MCP security model`

## Tests

- Unit tests mock `child_process`; no SuperCollider required for most tests
- `tests/cli.test.ts` runs real `sclang` when `scctl check` returns `STATUS: OK`
- CI installs SuperCollider on Ubuntu and runs the full suite

## Design notes

See [docs/design/control-approach-notes.md](docs/design/control-approach-notes.md) for background on the control architecture.
