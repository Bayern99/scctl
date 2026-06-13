# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> Branch `codex/agent-harness-narrow-roles` — not yet on `main`. See [docs/MERGE-READINESS.md](docs/MERGE-READINESS.md) before merging.

### Added

- **Runtime:** NRT render (`sc_render_nrt` / `render-nrt`), WAV verification metadata, capability-aware `check` / `health`
- **Harness & workflow:** route enforcement (`task_tag`, `compliance`), primitive lab, append-only archive, eval rubric, planner, workflow + orchestration MCP/CLI tools
- **Governance (Phase 7.1):** opt-in `SCCTL_GOVERNED_ROLE` / `SCCTL_FINAL_NRT` RBAC; governed session marker (`.scctl/governed-role`); Cursor hooks (`beforeMCPExecution`, `sessionStart`); `scripts/harness-audit.js` repo/skills/hooks scopes
- **Agent skills (Phase 7.2):** six `scctl-*` skills under `.agents/skills/`; `docs/guides/agent-skills-spec.zh-CN.md`; skill eval workspace baselines
- **Docs & onboarding:** operator runbook (EN + zh-CN), governed pilot tutorial, **consumer bootstrap** guide + `scripts/bootstrap-consumer-project.sh`
- **Starter assets:** `sc/families/*` probe / NRT templates; KB under `docs/superpowers/kb/`
- Design research: harness/memory/multi-agent notes; Zhou Yi consumer architecture assessment (reference, not runtime)

### Changed

- MCP and CLI share completion attachment and governance error payloads
- README / README.zh-CN: consumer project model, MCP vs CLI, usage-flow architecture
- Project skills path: `.agents/skills/` (agent-neutral; IDE hooks remain under `.cursor/`)

### Fixed

- Hook scripts run as ESM under `"type": "module"`

## [1.0.0] - 2026-06-09

### Added

- V1 `ScDriver` single-session runtime with explicit state and error semantics
- Protocol helpers with marker-based script completion in `src/runtime/protocol.ts`
- Driver control surface: `status`, `health`, `reset`, `reboot`, `reclaim`
- Structured JSON results for all CLI commands
- Pilot MCP tools: `sc_status`, `sc_health`, `sc_reset`, `sc_reboot`, `sc_reclaim`
- Protocol/driver unit tests and optional live smoke suite (`npm run test:live`)
- Realtime draft render flow that boots, records, verifies WAV output, and tears down cleanly
- CLI: `scctl check`, `scctl run <file>`
- MCP server: `sc_check`, `sc_eval`, `sc_stop`
- Cross-platform `sclang` path discovery
- `SclangController` with delimiter-based execute protocol
- Vitest test suite

### Changed

- Project branding: **SuperCollider Pilot** (`supercollider-pilot`); MCP remains the agent transport
- MCP and CLI now share the same `ScDriver` runtime
- `SclangController` executes marker-based scripts instead of wrapper-plus-text-guessing
- README, troubleshooting docs, and bilingual install guides updated for Pilot

### Removed

- Obsolete `src/runtime/render.ts` and `src/runtime/server-probe.ts` paths

[Unreleased]: https://github.com/Bayern99/supercollider-pilot/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Bayern99/supercollider-pilot/releases/tag/v1.0.0
