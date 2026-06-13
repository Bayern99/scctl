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
- Structured results for every action: `success`, `state`, `phase`, `session_id`, `recoverable`, `error_kind`, `summary`, `raw_output`, plus optional `session`, `artifact`, and `compliance`
- Recovery surface: `sc_stop`, `sc_reset`, `sc_reboot`, `sc_reclaim`
- Pilot MCP tools: `sc_check`, `sc_status`, `sc_health`, `sc_eval`, `sc_run_file`, `sc_logs`, `sc_render`, `sc_render_nrt`, `sc_stop`, `sc_reset`, `sc_reboot`, `sc_reclaim`
- CLI commands: `check`, `status`, `health`, `eval`, `run`, `logs`, `render`, `render-nrt`, `stop`, `reset`, `reboot`, `reclaim`
- Workflow surface: `plan-workflow`, `run-probe`, `summarize-session`, `candidate-action`, `memory-summary`
- Governance surface: `prepare-handoff`, `audit-session`, plus matching MCP tools for managed agent loops
- Realtime draft render flow that boots, records, verifies WAV output, and tears the session down cleanly
- Final-quality NRT render flow with capability-aware engine selection and WAV metadata capture
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

Optional global install:

```bash
npm link
scctl check
```

## Using Pilot in your project

Most teams use Pilot from a **consumer workspace** (music app, research repo, etc.) by pointing an Agent at the MCP server. You do **not** need to vendor this repository into your application code.

| What | Must live in the consumer workspace? | Notes |
|------|--------------------------------------|-------|
| Pilot binary (`dist/mcp/server.js`, `scctl`) | No | Install anywhere; reference absolute path in MCP config |
| Archive + governed marker | Yes | Written under the **Agent workspace root**: `.scctl/archive/`, `.scctl/governed-role` |
| KB (`docs/superpowers/kb/`) | For meaningful handoff | Loaded from consumer `cwd`; missing files → empty `kb_snapshot` |
| Agent skills (`.agents/skills/scctl-*`) | Recommended | Copied or linked; not loaded automatically with MCP alone |
| IDE hooks | Optional hard layer | Consumer `.cursor/hooks.json` + scripts from this repo |

Pilot runs as **separate OS processes** (Node MCP server + `sclang` / `scsynth` when rendering). It does not run inside your app server. Idle MCP overhead is small; rendering uses local CPU/RAM. Add `.scctl/` to `.gitignore`.

**One-shot consumer setup:**

```bash
/absolute/path/to/supercollider-pilot/scripts/bootstrap-consumer-project.sh /absolute/path/to/your-project
```

Copies KB, roles, `.agents/skills/scctl-*`, hooks, and Cursor hook config into the consumer workspace. Then add MCP (below). Details: [docs/guides/consumer-bootstrap.zh-CN.md](docs/guides/consumer-bootstrap.zh-CN.md).

**Agents should use MCP**, not shell CLI, for governed loops: native tool calls, persistent `sclang` session, and optional `beforeMCPExecution` hooks. Use **CLI** for operators, smoke tests, and CI scripts.

Human-oriented walkthrough (Chinese): [docs/guides/governed-pilot-tutorial.zh-CN.md](docs/guides/governed-pilot-tutorial.zh-CN.md)  
**New consumer project (checklist + bootstrap script):** [docs/guides/consumer-bootstrap.zh-CN.md](docs/guides/consumer-bootstrap.zh-CN.md)  
Operator reference: [docs/operator-runbook.md](docs/operator-runbook.md) · [中文版](docs/operator-runbook.zh-CN.md)

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
node dist/cli.js run path/to/script.scd --task-tag sc-probe

# Inspect logs from the active session
node dist/cli.js logs --tail 500

# Record a .scd file to WAV
node dist/cli.js render path/to/script.scd -o /tmp/out.wav -d 5
node dist/cli.js render path/to/script.scd -o /tmp/out.wav -d 5 --task-tag sc-audio-generation

# Final-quality NRT render from an absolute .scd path
node dist/cli.js render-nrt /absolute/path/to/final-nrt.scd -o /tmp/final.wav
node dist/cli.js render-nrt /absolute/path/to/final-nrt.scd -o /tmp/final.wav --engine supernova --sample-format double

# Recovery actions
node dist/cli.js reset
node dist/cli.js reboot
node dist/cli.js reclaim

# Workflow planning and probe execution
node dist/cli.js plan-workflow --context '{"task_tag":"sc-probe","goal":"inspect a new timbral direction"}'
node dist/cli.js run-probe --spec '{"mode":"run_file","path":"/absolute/path/to/probe.scd","task_tag":"sc-probe"}'
node dist/cli.js summarize-session --input '{"session_id":"session-1","task":"probe a texture","outcome":"mixed","preserved_items":["slow envelope contour"],"failures":["render clipped"],"notes":["keep the modulation shape"]}'
node dist/cli.js candidate-action --input '{"session_id":"session-1","action":"create_draft","candidate_id":"cand-1","name":"grain-cloud-a","source_probe_id":"probe-1","summary":"promising density"}'
node dist/cli.js memory-summary --limit 10

# Governed handoff and audit
node dist/cli.js prepare-handoff --input '{"task_id":"task-1","task_tag":"sc-audio-generation","goal":"render a Zhou Yi texture study","requested_outcome":"explore"}'
node dist/cli.js audit-session --input '{"session_id":"session-1","task_tag":"sc-audio-generation"}'
```

### MCP vs CLI

| | **MCP** (default for Agents) | **CLI** (operators / scripts) |
|---|------------------------------|----------------------------------|
| Entry | Cursor, Claude Desktop, other MCP clients | `node dist/cli.js …` or `scctl …` |
| Session | Long-lived server reuses one `ScDriver` / `sclang` | New Node process per invocation |
| Governed RBAC | Set `SCCTL_GOVERNED_ROLE` / `SCCTL_FINAL_NRT` in MCP `env` | Same env vars on the command |
| IDE preflight hooks | Apply to MCP tool calls when configured | Do not apply to shell commands |

MCP-only setup (no env, no hooks, no skills) still exposes all tools but defaults to **operator/debug** behavior — raw runtime tools are not hard-blocked.

### Pilot server (MCP)

Start the Pilot MCP server (stdio transport):

```bash
node dist/mcp/server.js
```

**Claude Desktop / Cursor** — add to MCP config (use an **absolute path** to `dist/mcp/server.js`; `cwd` is the opened workspace):

```json
{
  "mcpServers": {
    "supercollider-pilot": {
      "command": "node",
      "args": ["/absolute/path/to/supercollider-pilot/dist/mcp/server.js"],
      "env": {
        "SCCTL_GOVERNED_ROLE": "builder"
      }
    }
  }
}
```

Unset `SCCTL_GOVERNED_ROLE` for operator/debug. Optional governed hardening: copy `.agents/skills/scctl-*` and hook entries from `hooks/hooks.json` into the consumer workspace.

| Tool | Parameters | Description |
|------|------------|-------------|
| `sc_check` | — | Verify engine discovery and interpreter reachability |
| `sc_status` | — | Return the current driver session snapshot |
| `sc_health` | — | Probe active-session health and server readiness |
| `sc_eval` | `code` (required) | Evaluate inline code in the active session |
| `sc_run_file` | `path` (required), `task_tag` (optional) | Read and evaluate a `.scd` file in the active session |
| `sc_logs` | `tail` (optional) | Return the active session log buffer |
| `sc_render` | `out` (required), `path` or `code`, `duration`, `task_tag` (optional) | Render a draft WAV and stop the session afterward |
| `sc_render_nrt` | `path` (required), `out` (required), `duration`, `engine_preference`, `sample_format`, `task_tag` (optional) | Render a final-quality WAV through NRT from an absolute `.scd` source |
| `sc_stop` | — | Stop the active session |
| `sc_reset` | — | Clean the active session without discarding it |
| `sc_reboot` | — | Replace the active session with a fresh ready session |
| `sc_reclaim` | — | Recover from a degraded or ambiguous local session |

Additional governed workflow tools:

| Tool | Parameters | Description |
|------|------------|-------------|
| `sc_plan_workflow` | `spec` or `context` | Select a workflow and return prompts plus path expectations |
| `sc_run_probe` | `spec` (required) | Validate and execute a `ProbeSpec` through `ScDriver` |
| `sc_summarize_session` | structured summary payload | Append a session summary record to archive |
| `sc_candidate_action` | structured lifecycle payload | Apply candidate lifecycle or review actions |
| `sc_memory_summary` | `session_id`, `candidate_id`, `limit` (all optional) | Build a project-level memory summary from archive |
| `sc_prepare_handoff` | task envelope | Prepare manager / builder / critic packets plus KB snapshot |
| `sc_audit_session` | `session_id` (required), `task_tag`, `candidate_id` | Audit a governed session and recommend the next step |

### Agent workflow

#### Governed loop walkthrough

Default governed creation loop (see [docs/operator-runbook.md](docs/operator-runbook.md)):

```text
prepare-handoff → run-probe → summarize-session → candidate-action / add_review → audit-session → memory-summary
```

Successful `audit-session` appends a `session_audit` record to `.scctl/archive/archive-events.jsonl`.

#### Task tags

| Task tag | Terminal action | Requires `.scd` source | Requires render artifact | Requires review note |
|----------|-----------------|------------------------|--------------------------|----------------------|
| `sc-probe` | none | no | no | no |
| `sc-audio-generation` | `render` or `render_nrt` | yes | yes | yes |
| `sc-render-review` | `render` or `render_nrt` | no | yes | yes |

Canonical rules: [docs/design/route-enforcement-rules.md](docs/design/route-enforcement-rules.md) and `src/harness/policies.ts`.

#### Draft vs final NRT

- **Draft:** `render` / `sc_render` — fast iteration listens; session closes after render.
- **Final NRT:** `render-nrt` / `sc_render_nrt` — final-quality export; requires absolute NRT `.scd` sources (see `sc/families/*/final-nrt.scd`).
- Tasks with `quality.render_tier: final_nrt` cannot close through draft artifacts in `audit-session`.

Typical operator/debug loop: `sc_check` → `sc_status`/`sc_health` → `sc_eval` or `sc_run_file` → `sc_logs` (on error) → `sc_render` → `sc_reclaim` or `sc_stop`.

- Use **absolute paths** for `.scd` files and WAV output (no default cwd).
- Keep application/domain logic out of SuperCollider — use `.scd` for SynthDefs, playback, and render snippets only.
- The driver is **single-session and local-first**. Recovery is explicit; use `sc_reset`, `sc_reboot`, or `sc_reclaim` instead of guessing from raw logs alone.
- CLI output is structured JSON. Raw SuperCollider output is preserved in `raw_output`.
- `run` and `render` accept optional task tags. When present, Pilot returns a `compliance` block that records route discipline, source kind, and artifact completeness.
- Render artifacts now include verification metadata, so callers can distinguish “render flow ran” from “valid non-empty WAV was produced.”
- `check` and `health` now report capability facts for `sclang`, `scsynth`, `supernova`, extension paths, Quarks paths, detected `sc3-plugins`, and NRT availability.
- Raw `sc_eval`, `sc_run_file`, and `sc_render` remain the operator/debug surface. `sc_render_nrt` is the explicit final-quality runtime surface. Managed creative workflows should default to the governed workflow tools above.

Design specs:

- [docs/guides/consumer-bootstrap.zh-CN.md](docs/guides/consumer-bootstrap.zh-CN.md) — consumer checklist + bootstrap script
- [docs/guides/governed-pilot-tutorial.zh-CN.md](docs/guides/governed-pilot-tutorial.zh-CN.md) — usage flow, consumer bootstrap, prompts
- [docs/guides/agent-skills-spec.zh-CN.md](docs/guides/agent-skills-spec.zh-CN.md) — project skills in `.agents/skills/`
- [AGENTS.md](AGENTS.md) — module boundaries for contributors
- [docs/operator-runbook.md](docs/operator-runbook.md)
- [docs/design/scctl-scope-enhancement.md](docs/design/scctl-scope-enhancement.md)
- [docs/design/boundary-freeze.md](docs/design/boundary-freeze.md)
- [docs/design/route-enforcement-rules.md](docs/design/route-enforcement-rules.md)
- [docs/design/primitive-lab-spec.md](docs/design/primitive-lab-spec.md)
- [docs/design/candidate-lifecycle.md](docs/design/candidate-lifecycle.md)
- [docs/design/eval-rubric.md](docs/design/eval-rubric.md)
- [docs/design/planner-spec.md](docs/design/planner-spec.md)

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

### Usage flow (governed task)

```text
Prompt → Agent (+ .agents/skills on demand)
      → Harness (SCCTL_GOVERNED_ROLE, hooks, completion-rules)
      → MCP or CLI → Pilot orchestration / workflow / runtime
      → sclang / scsynth + .scctl/archive
      → review loop (listening, critic, audit)
```

### Pilot internals (code layout)

```text
Agent client
       │
       ▼
src/mcp/server.ts  or  src/cli.ts
       │
       ├── orchestration / workflow (handoff, probe, audit)
       └── ScDriver (src/runtime/driver.ts)
               ▼
       SclangController → sclang → scsynth → audio
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
