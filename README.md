# supercollider-pilot

[English](README.md) | [简体中文](README.zh-CN.md)

**SuperCollider Pilot — structured agent driver for SuperCollider** — includes the `scctl` CLI and an MCP transport.

[![CI](https://github.com/Bayern99/supercollider-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Bayern99/supercollider-pilot/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Wraps the [SuperCollider](https://supercollider.github.io/) `sclang` interpreter as **Pilot**, a single-session local driver with a matching CLI and [MCP](https://modelcontextprotocol.io) transport. Pilot keeps one active local session, returns structured results, exposes recovery actions, and keeps raw SuperCollider output alongside machine-readable state.

## Features

- Cross-platform `sclang` discovery (macOS, Windows, Linux, plus `PATH` fallback)
- Single-session driver runtime with explicit state: `engine_missing -> idle -> booting -> ready -> busy -> degraded -> stopping -> stopped`
- Structured results for every action: `success`, `state`, `phase`, `session_id`, `recoverable`, `error_kind`, `summary`, `raw_output`
- Recovery surface: `sc_stop`, `sc_reset`, `sc_reboot`, `sc_reclaim`
- Pilot MCP tools: `sc_check`, `sc_status`, `sc_health`, `sc_eval`, `sc_run_file`, `sc_logs`, `sc_render`, `sc_stop`, `sc_reset`, `sc_reboot`, `sc_reclaim`
- CLI commands: `check`, `status`, `health`, `eval`, `run`, `logs`, `render`, `stop`, `reset`, `reboot`, `reclaim`
- Realtime draft render flow that boots, records, verifies WAV output, and tears the session down cleanly
- Vitest coverage for protocol helpers, runtime, Pilot routing, CLI behavior, and optional live smoke

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js | 22+ |
| SuperCollider | 3.13+ (`sclang` on `PATH` or default install location) |

Default `sclang` locations:

| Platform | Path |
|----------|------|
| macOS | `/Applications/SuperCollider.app/Contents/MacOS/sclang` |
| Windows | `C:\Program Files\SuperCollider\sclang.exe` |
| Linux | `/usr/bin/sclang` or `/usr/local/bin/sclang` |

## Install

```bash
git clone https://github.com/Bayern99/supercollider-pilot.git
cd supercollider-pilot
npm install
npm run build
```

Verify SuperCollider is reachable:

```bash
node dist/cli.js check
```

Expected output when installed: structured JSON with `success`, `state`, and `summary`.

## Usage

### CLI

```bash
# Check engine reachability
node dist/cli.js check

# Inspect current session state
node dist/cli.js status
node dist/cli.js health

# Evaluate inline code
node dist/cli.js eval "{ SinOsc.ar(440, 0, 0.05) }.play;"

# Run a .scd file
node dist/cli.js run path/to/script.scd

# Inspect logs from the active session
node dist/cli.js logs --tail 500

# Record a .scd file to WAV
node dist/cli.js render path/to/script.scd -o /tmp/out.wav -d 5

# Recovery actions
node dist/cli.js reset
node dist/cli.js reboot
node dist/cli.js reclaim

# Optional global install
npm link
scctl check
```

### Pilot server (MCP)

Start the Pilot MCP server (stdio transport):

```bash
node dist/mcp/server.js
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supercollider-pilot": {
      "command": "node",
      "args": ["/absolute/path/to/supercollider-pilot/dist/mcp/server.js"]
    }
  }
}
```

| Tool | Parameters | Description |
|------|------------|-------------|
| `sc_check` | — | Verify engine discovery and interpreter reachability |
| `sc_status` | — | Return the current driver session snapshot |
| `sc_health` | — | Probe active-session health and server readiness |
| `sc_eval` | `code` (required) | Evaluate inline code in the active session |
| `sc_run_file` | `path` (required) | Read and evaluate a `.scd` file in the active session |
| `sc_logs` | `tail` (optional) | Return the active session log buffer |
| `sc_render` | `out` (required), `path` or `code`, `duration` | Render a draft WAV and stop the session afterward |
| `sc_stop` | — | Stop the active session |
| `sc_reset` | — | Clean the active session without discarding it |
| `sc_reboot` | — | Replace the active session with a fresh ready session |
| `sc_reclaim` | — | Recover from a degraded or ambiguous local session |

### Agent workflow

Typical design-phase loop: `sc_check` → `sc_status`/`sc_health` → `sc_eval` or `sc_run_file` → `sc_logs` (on error) → `sc_render` → `sc_reclaim` or `sc_stop`.

- Use **absolute paths** for `.scd` files and WAV output (no default cwd).
- Keep application/domain logic out of SuperCollider — use `.scd` for SynthDefs, playback, and render snippets only.
- The driver is **single-session and local-first**. Recovery is explicit; use `sc_reset`, `sc_reboot`, or `sc_reclaim` instead of guessing from raw logs alone.
- CLI output is structured JSON. Raw SuperCollider output is preserved in `raw_output`.

Design spec: [docs/design/scctl-scope-enhancement.md](docs/design/scctl-scope-enhancement.md)

### Smoke test (requires local SuperCollider)

```bash
npm run build
node dist/cli.js check    # expect structured JSON with success/state/summary
node dist/cli.js render fixtures/smoke/sine-play.scd -o /tmp/scctl-smoke.wav -d 2
test -s /tmp/scctl-smoke.wav
```

If smoke fails locally, see [docs/smoke-troubleshooting.md](docs/smoke-troubleshooting.md).

Optional live integration suite:

```bash
npm run test:live
```

### Examples

```bash
node play-music.js    # Play a generated pentatonic pattern (~10s)
node record-music.js  # Record output to ./music.wav
```

## Architecture

```text
Pilot client / CLI
       │
       ▼
src/mcp/server.ts  or  src/cli.ts
       │
       ▼
ScDriver (src/runtime/driver.ts)
       │  structured state + recovery + protocol helpers
       ▼
SclangController (src/runtime/sclang.ts)
       │  raw script execution + completion markers
       ▼
sclang → scsynth → audio output
```

Key constraints:

- One active local session at a time
- Serial execution only — concurrent script runs are rejected
- Driver success/failure is decided from protocol completion plus raw SuperCollider error detection, not from free-form post text alone
- Shutdown sends `CmdPeriod.run; Server.killAll;` then SIGKILL if needed

See [docs/design/control-approach-notes.md](docs/design/control-approach-notes.md) for design background.

## Security

`sc_eval` runs arbitrary SuperCollider code with host filesystem and process access. Use only with trusted local Pilot/MCP clients. Do not expose the Pilot server on a network.

Details: [SECURITY.md](SECURITY.md).

## Development

```bash
npm run typecheck
npm run build
npm test
npm run test:live   # optional, requires local SuperCollider
```

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

ISC — see [LICENSE](LICENSE).
