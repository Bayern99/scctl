# Operator Runbook — supercollider-pilot（中文版）

> 英文版：[operator-runbook.md](./operator-runbook.md)  
> **Consumer 新项目接入：** [consumer-bootstrap.zh-CN.md](./guides/consumer-bootstrap.zh-CN.md)  
> 使用流程与 Prompt：[governed-pilot-tutorial.zh-CN.md](./guides/governed-pilot-tutorial.zh-CN.md)

本手册供在本地操作 `scctl` / Pilot MCP 的人员与 agent 使用。

## 前置条件

- Node.js 22+
- SuperCollider 3.13+，`sclang` 可在默认安装路径或 `PATH` 中发现
- 所有 `.scd` 输入与 WAV 输出使用**绝对路径**
- 首次构建：`npm install && npm run build`

验证引擎可达性：

```bash
node dist/cli.js check
node dist/cli.js health
```

## Operator/debug 与 governed 面

| 意图 | 优先使用 | 不可用于「任务完成」声明 |
|------|----------|--------------------------|
| 快速内联测试 | `eval`、`sc_eval` | 宣称 governed 任务已完成 |
| 单次跑 probe 文件 | `run` / `sc_run_file`，加 `--task-tag sc-probe` | 对比 candidate 时跳过 archive |
| Draft WAV 试听 | `render` / `sc_render` | 关闭 `final_nrt` 任务 |
| 最终品质 WAV | `render-nrt` / `sc_render_nrt`，或 governed `run-probe` 且 `render_nrt` | 用 draft render 当最终产物 |
| 长周期创作闭环 | `prepare-handoff` → `run-probe` → `summarize-session` → `candidate-action` → `audit-session` → `memory-summary` | 仅 raw runtime 工具 |

Raw runtime 工具默认作为 **operator/debug** 面开放。提供 `task_tag` 时会返回可选 `compliance` 快照。详见 [route-enforcement-rules.md](../design/route-enforcement-rules.md)。

## Governed 模式（可选硬 enforcement）

模拟窄角色 agent 时，可在进程内启用角色 RBAC：

| 变量 | 取值 | 效果 |
|------|------|------|
| `SCCTL_GOVERNED_ROLE` | `manager`、`builder`、`critic` | MCP/CLI 拒绝超出 [`role-tool-policies.json`](superpowers/kb/role-tool-policies.json) allowlist 的工具 |
| `SCCTL_FINAL_NRT` | `1` / `true` | governed 模式下额外拒绝 draft `render` / `sc_render` |

策略 canonical 源：`src/harness/role-policies.ts`（加载上述 JSON）。

示例：

```bash
# Builder 可用 sc_run_probe，不可用 raw eval
SCCTL_GOVERNED_ROLE=builder node dist/cli.js eval "1+1"   # 被拒绝

# Operator/debug（默认）：行为不变
node dist/cli.js eval "1+1"
```

`prepare-handoff` 成功后，Pilot 会写入 `.scctl/governed-role`（gitignore），即使未设环境变量，Cursor hooks 也可阻断 raw MCP 工具：

- 仓库 hook 入口：`hooks/hooks.json`
- Cursor hook 入口：`.cursor/hooks.json`
- 预检脚本：`hooks/scctl-governed-preflight.js`
- 会话提示脚本：`hooks/scctl-session-start.js`（`sessionStart`）

Harness 审计：`node scripts/harness-audit.js repo --format text`（或 `skills` / `hooks` scope）。

需要留下 archive 轨迹的创作任务，**默认**应走 governed workflow 与 orchestration 工具。

## Task tags

Canonical 源：`src/harness/policies.ts`

| Task tag | 终端动作 | 需要 `.scd` 源 | 需要 render 产物 | 需要 review 备注 |
|----------|----------|----------------|------------------|------------------|
| `sc-probe` | 无 | 否 | 否 | 否 |
| `sc-audio-generation` | `render` 或 `render_nrt` | 是 | 是 | 是 |
| `sc-render-review` | `render` 或 `render_nrt` | 否 | 是 | 是 |

示例：

```bash
node dist/cli.js run /absolute/path/probe.scd --task-tag sc-probe
node dist/cli.js render /absolute/path/script.scd -o /tmp/draft.wav -d 5 --task-tag sc-audio-generation
node dist/cli.js render-nrt /absolute/path/final-nrt.scd -o /tmp/final.wav --task-tag sc-audio-generation
```

## Draft 与 final NRT

| 需求 | 命令 | 产物层级 |
|------|------|----------|
| 快速试听 / 迭代 | `render` / `sc_render` | draft |
| 最终导出 / audit 闭环 | `render-nrt` / `sc_render_nrt` 或 governed NRT probe | `final_nrt` |

规则：

- NRT 要求 `.scd` 与输出路径均为**绝对路径**。
- NRT 源文件须返回含 `\score`、`\duration` 的 Event/Dictionary；可选 `\sample_rate`、`\sample_format`、`\channel_count`。
- 任务声明 `quality.render_tier: final_nrt` 时，draft 产物**不足以**通过 `audit-session`。

入门 NRT 资产位于 `sc/families/*/final-nrt.scd`。

## Governed 闭环 walkthrough

```bash
# 1. Handoff
node dist/cli.js prepare-handoff --input '{"task_id":"task-1","task_tag":"sc-probe","goal":"Explore sustained tonal carrier","requested_outcome":"explore"}'

# 2. Probe（sc 资产用绝对路径）
node dist/cli.js run-probe --spec '{"id":"probe-1","title":"Carrier probe","question":"Is sustain stable?","mode":"run_file","file_path":"/absolute/path/to/sc/families/sustained-tonal-carrier/probe.scd","tags":["sc-probe"]}'

# 3. Summarize（session_id 来自 probe 结果）
node dist/cli.js summarize-session --input '{"session_id":"<session_id>","task":"carrier probe","outcome":"mixed","preserved_items":["slow envelope contour"],"failures":[],"notes":["keep modulation shape"]}'

# 4. Candidate action
node dist/cli.js candidate-action --input '{"session_id":"<session_id>","action":"create_draft","candidate_id":"cand-carrier-1","name":"sustained-tonal-carrier","source_probe_id":"probe-1","summary":"promising sustain"}'

# 5. Audit（写入 archive 的 session_audit）
node dist/cli.js audit-session --input '{"session_id":"<session_id>","task_tag":"sc-probe"}'

# 6. Memory
node dist/cli.js memory-summary --limit 10
```

## Archive 布局

默认根目录：`.scctl/archive/archive-events.jsonl`

记录类型：

- `probe_run`
- `session_summary`
- `candidate_lifecycle`
- `review_note`
- `session_audit` — `audit-session` 成功时追加

本地 archive 数据已 gitignore。勿提交 `.scctl/` 或生成的 `*.wav`。

## 故障恢复

| 症状 | 可能状态 | 处理 |
|------|----------|------|
| `engine_missing` | 无 `sclang` | 安装 SuperCollider 或修正 PATH |
| `degraded` / 异常退出 | session 脏 | `reset` → `reboot` → `reclaim` |
| WAV 为空或缺失 | render 校验失败 | 查看 `artifact.verification.failure_reasons`，用 `sc_logs` 后重跑 |
| `busy` / session 冲突 | 并发调用 | 等待后 `stop` 或 `reclaim` |
| NRT 不可用 | 缺少 `scsynth` | 用 `check` / `health` 查看 capabilities |

## 当前基线的诚实限制

- 合规默认**软 enforcement**；可选 `task_tag` 仅返回 `compliance` 元数据，不阻断执行。
- **可选 RBAC（Phase 7.1）：** `SCCTL_GOVERNED_ROLE` 在 MCP/CLI 入口 enforce allowlist；见上文 governed 模式。
- **Agent skills（Phase 7.2）：** 流程指引在 `.agents/skills/`；不能替代 hooks 或 RBAC。
- Live smoke 测试需本地 SuperCollider，不在默认 CI 中。

另见：[docs/superpowers/status.md](../superpowers/status.md)  
新手入门：[docs/guides/governed-pilot-tutorial.zh-CN.md](./guides/governed-pilot-tutorial.zh-CN.md)
