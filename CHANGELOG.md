# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions CI, Dependabot, LICENSE, SECURITY.md, CONTRIBUTING.md
- `SclangControllerOptions`: execute timeout (default 120s), log buffer cap
- Example scripts: `play-music.js`, `record-music.js`
- Comprehensive README

### Changed

- `wrapScCode()` uses string concatenation instead of template literals (injection fix)
- `stop()` rejects in-flight execute before shutdown; cleanup after process exit
- Example scripts use `s.boot; s.sync;` instead of async `waitForBoot`

### Fixed

- Execute hangs when delimiter appears on stderr
- Concurrent `boot()` could spawn multiple sclang processes
- `record-music.js` hardcoded absolute path replaced with `process.cwd()`

## [1.0.0] - 2026-06-09

### Added

- CLI: `scctl check`, `scctl run <file>`
- MCP server: `sc_check`, `sc_eval`, `sc_stop`
- Cross-platform `sclang` path discovery
- `SclangController` with delimiter-based execute protocol
- Vitest test suite

[Unreleased]: https://github.com/Bayern99/supercollider-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Bayern99/supercollider-mcp/releases/tag/v1.0.0
