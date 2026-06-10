# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- V1 `ScDriver` single-session runtime with explicit state and error semantics
- Protocol helpers with marker-based script completion in `src/runtime/protocol.ts`
- Driver control surface: `status`, `health`, `reset`, `reboot`, `reclaim`
- Structured JSON results for all CLI commands
- Pilot MCP tools: `sc_status`, `sc_health`, `sc_reset`, `sc_reboot`, `sc_reclaim`
- Protocol/driver unit tests and optional live smoke suite (`npm run test:live`)
- Realtime draft render flow that boots, records, verifies WAV output, and tears down cleanly

### Changed

- Project branding: **SuperCollider Pilot** (`supercollider-pilot`); MCP remains the agent transport
- MCP and CLI now share the same `ScDriver` runtime
- `SclangController` executes marker-based scripts instead of wrapper-plus-text-guessing
- README, troubleshooting docs, and bilingual install guides updated for Pilot

### Removed

- Obsolete `src/runtime/render.ts` and `src/runtime/server-probe.ts` paths

## [1.0.0] - 2026-06-09

### Added

- CLI: `scctl check`, `scctl run <file>`
- MCP server: `sc_check`, `sc_eval`, `sc_stop`
- Cross-platform `sclang` path discovery
- `SclangController` with delimiter-based execute protocol
- Vitest test suite

[Unreleased]: https://github.com/Bayern99/supercollider-pilot/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Bayern99/supercollider-pilot/releases/tag/v1.0.0
