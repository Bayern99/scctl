# Operator Runbook — supercollider-pilot

> 中文版：[operator-runbook.zh-CN.md](./operator-runbook.zh-CN.md)  
> **Consumer bootstrap:** [consumer-bootstrap.zh-CN.md](./guides/consumer-bootstrap.zh-CN.md)  
> Workflow and prompts: [governed-pilot-tutorial.zh-CN.md](./guides/governed-pilot-tutorial.zh-CN.md)

This runbook is for humans and agents operating `scctl` / Pilot MCP locally.

## Prerequisites

- Node.js 22+
- SuperCollider 3.13+ with `sclang` discoverable on the default install path or `PATH`
- Absolute paths for all `.scd` inputs and WAV outputs
- Build once: `npm install && npm run build`

Verify engine reachability:

```bash
node dist/cli.js check
node dist/cli.js health
```

## Operator/debug vs governed surfaces

| Intent | Prefer | Avoid for closure |
|--------|--------|-------------------|
| Quick inline test | `eval`, `sc_eval` | claiming a governed task is done |
| Run a probe file once | `run` / `sc_run_file` with `--task-tag sc-probe` | skipping archive when comparing candidates |
| Draft WAV listen test | `render` / `sc_render` | closing `final_nrt` tasks |
| Final-quality WAV | `render-nrt` / `sc_render_nrt` or governed `run-probe` with `render_nrt` | using draft render as final artifact |
| Long-horizon creative loop | `prepare-handoff` → `run-probe` → `summarize-session` → `candidate-action` → `audit-session` → `memory-summary` | raw runtime tools only |

Raw runtime tools remain available as **operator/debug** surfaces by default. They return optional `compliance` when `task_tag` is supplied. See [route-enforcement-rules.md](../design/route-enforcement-rules.md).

## Governed mode (opt-in hard enforcement)

Enable in-process role RBAC when simulating narrow agent roles:

| Variable | Values | Effect |
|----------|--------|--------|
| `SCCTL_GOVERNED_ROLE` | `manager`, `builder`, `critic` | MCP/CLI reject tools outside the role allowlist in [`role-tool-policies.json`](superpowers/kb/role-tool-policies.json) |
| `SCCTL_FINAL_NRT` | `1` / `true` | Also reject draft `render` / `sc_render` while governed mode is active |

Canonical policy source: `src/harness/role-policies.ts` (loads the JSON above).

Examples:

```bash
# Builder may use sc_run_probe but not raw eval
SCCTL_GOVERNED_ROLE=builder node dist/cli.js eval "1+1"   # rejected

# Operator/debug (default): unchanged
node dist/cli.js eval "1+1"
```

After a successful `prepare-handoff`, Pilot writes `.scctl/governed-role` (gitignored) so Cursor hooks can block raw MCP tools even without env vars:

- Repo hook entry: `hooks/hooks.json`
- Cursor hook entry: `.cursor/hooks.json`
- Preflight script: `hooks/scctl-governed-preflight.js`
- Session hint script: `hooks/scctl-session-start.js` (`sessionStart`)

Harness audit: `node scripts/harness-audit.js repo --format text` (or `skills` / `hooks` scope).

Governed workflow and orchestration tools are the **default for creative tasks** that must leave an archive trail.

## Task tags

Canonical source: `src/harness/policies.ts`

| Task tag | Terminal action | Requires `.scd` source | Requires render artifact | Requires review note |
|----------|-----------------|------------------------|--------------------------|----------------------|
| `sc-probe` | none | no | no | no |
| `sc-audio-generation` | `render` or `render_nrt` | yes | yes | yes |
| `sc-render-review` | `render` or `render_nrt` | no | yes | yes |

Example:

```bash
node dist/cli.js run /absolute/path/probe.scd --task-tag sc-probe
node dist/cli.js render /absolute/path/script.scd -o /tmp/draft.wav -d 5 --task-tag sc-audio-generation
node dist/cli.js render-nrt /absolute/path/final-nrt.scd -o /tmp/final.wav --task-tag sc-audio-generation
```

## Draft vs final NRT

| Need | Command | Artifact tier |
|------|---------|---------------|
| Fast listen / iteration | `render` / `sc_render` | draft |
| Final export / audit closure | `render-nrt` / `sc_render_nrt` or governed NRT probe | `final_nrt` |

Rules:

- NRT requires **absolute** `.scd` and output paths.
- NRT source files must return an Event/Dictionary with `\score`, `\duration`, and optional `\sample_rate`, `\sample_format`, `\channel_count`.
- If a task declares `quality.render_tier: final_nrt`, draft artifacts are **not** sufficient for `audit-session` acceptance.

Starter NRT assets live under `sc/families/*/final-nrt.scd`.

## Governed loop walkthrough

```bash
# 1. Handoff
node dist/cli.js prepare-handoff --input '{"task_id":"task-1","task_tag":"sc-probe","goal":"Explore sustained tonal carrier","requested_outcome":"explore"}'

# 2. Probe (use absolute path to sc asset)
node dist/cli.js run-probe --spec '{"id":"probe-1","title":"Carrier probe","question":"Is sustain stable?","mode":"run_file","file_path":"/absolute/path/to/sc/families/sustained-tonal-carrier/probe.scd","tags":["sc-probe"]}'

# 3. Summarize (use session_id from probe result)
node dist/cli.js summarize-session --input '{"session_id":"<session_id>","task":"carrier probe","outcome":"mixed","preserved_items":["slow envelope contour"],"failures":[],"notes":["keep modulation shape"]}'

# 4. Candidate action
node dist/cli.js candidate-action --input '{"session_id":"<session_id>","action":"create_draft","candidate_id":"cand-carrier-1","name":"sustained-tonal-carrier","source_probe_id":"probe-1","summary":"promising sustain"}'

# 5. Audit (persists session_audit to archive)
node dist/cli.js audit-session --input '{"session_id":"<session_id>","task_tag":"sc-probe"}'

# 6. Memory
node dist/cli.js memory-summary --limit 10
```

## Archive layout

Default root: `.scctl/archive/archive-events.jsonl`

Record kinds:

- `probe_run`
- `session_summary`
- `candidate_lifecycle`
- `review_note`
- `session_audit` — appended when `audit-session` succeeds

Local archive data is gitignored. Do not commit `.scctl/` or generated `*.wav`.

## Recovery playbook

| Symptom | Likely state | Action |
|---------|--------------|--------|
| `engine_missing` | no `sclang` | install SuperCollider or fix PATH |
| `degraded` / unexpected exit | dirty session | `reset` → `reboot` → `reclaim` |
| empty or missing WAV | render failed verification | inspect `artifact.verification.failure_reasons`, rerun with `sc_logs` |
| `busy` / session conflict | overlapping calls | wait, then `stop` or `reclaim` |
| NRT unavailable | missing `scsynth` | check `check`/`health` capabilities |

## Honest limits (current baseline)

- Compliance is **soft by default**; optional `task_tag` returns `compliance` metadata without blocking.
- **Opt-in RBAC (Phase 7.1):** `SCCTL_GOVERNED_ROLE` enforces allowlists at MCP/CLI; see governed mode section above.
- **Agent skills (Phase 7.2):** procedural guides in `.agents/skills/`; they do not replace hooks or RBAC.
- Live smoke tests require local SuperCollider and are not part of default CI.

See also: [docs/superpowers/status.md](../superpowers/status.md)
