# scctl

**SuperCollider control bridge for AI agents** — expose `sclang` to MCP clients and a small CLI.

[![CI](https://github.com/Bayern99/scctl/actions/workflows/ci.yml/badge.svg)](https://github.com/Bayern99/scctl/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

scctl wraps the [SuperCollider](https://supercollider.github.io/) `sclang` interpreter so tools like Claude Desktop, Cursor, and other [MCP](https://modelcontextprotocol.io) clients can check installation, evaluate code, and shut down audio cleanly. It also ships a standalone CLI.

## Features

- Cross-platform `sclang` discovery (macOS, Windows, Linux, plus `PATH` fallback)
- Persistent `SclangController` with delimiter-based stdout/stderr parsing
- MCP tools: `sc_check`, `sc_eval`, `sc_stop`
- CLI: `scctl check`, `scctl run <file.scd>`
- Graceful shutdown with SIGINT/SIGTERM handling and execute timeout (default 120s)
- Vitest coverage for discovery, runtime, CLI, and MCP routing

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
git clone https://github.com/Bayern99/scctl.git
cd scctl
npm install
npm run build
```

Verify SuperCollider is reachable:

```bash
node dist/cli.js check
```

Expected output when installed:

```text
STATUS: OK
PATH: /Applications/SuperCollider.app/Contents/MacOS/sclang
```

## Usage

### CLI

```bash
# Check installation
node dist/cli.js check

# Run a .scd file
node dist/cli.js run path/to/script.scd

# Optional global install
npm link
scctl check
```

### MCP server

Start the server (stdio transport):

```bash
node dist/mcp/server.js
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supercollider": {
      "command": "node",
      "args": ["/absolute/path/to/scctl/dist/mcp/server.js"]
    }
  }
}
```

| Tool | Parameters | Description |
|------|------------|-------------|
| `sc_check` | — | Return whether `sclang` is available and its path |
| `sc_eval` | `code` (string, required) | Evaluate SuperCollider code in a persistent session |
| `sc_stop` | — | Stop synthesis, release audio, shut down `sclang` |

### Examples

```bash
node play-music.js    # Play a generated pentatonic pattern (~10s)
node record-music.js  # Record output to ./music.wav
```

## Architecture

```text
MCP client / CLI
       │
       ▼
src/mcp/server.ts  or  src/cli.ts
       │
       ▼
SclangController (src/runtime/sclang.ts)
       │  stdin/stdout delimiter protocol
       ▼
sclang → scsynth → audio output
```

Key constraints:

- One `sclang` process per controller (single audio device owner)
- Serial execution only — concurrent `execute()` calls are rejected
- Shutdown sends `CmdPeriod.run; Server.killAll;` then SIGKILL if needed

See [docs/design/control-approach-notes.md](docs/design/control-approach-notes.md) for design background.

## Security

`sc_eval` runs arbitrary SuperCollider code with host filesystem and process access. Use only with trusted local MCP clients. Do not expose the MCP server on a network.

Details: [SECURITY.md](SECURITY.md).

## Development

```bash
npm run typecheck
npm run build
npm test
```

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

ISC — see [LICENSE](LICENSE).
