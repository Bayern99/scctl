# supercollider-pilot

[English](README.md) | [简体中文](README.zh-CN.md)

**SuperCollider Pilot — 面向 AI Agent 的结构化 SuperCollider 本地驱动**，附带 `scctl` CLI 与 MCP 传输层。

[![CI](https://github.com/Bayern99/supercollider-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/Bayern99/supercollider-pilot/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

将 [SuperCollider](https://supercollider.github.io/) 的 `sclang` 封装为 **Pilot** 单会话本地驱动，并提供对应 CLI 与 [MCP](https://modelcontextprotocol.io) 传输层。Pilot 保持单个本地活动会话，统一返回结构化结果，并同时保留原始 SuperCollider 输出，便于 Agent 做稳定判断与恢复。

## 功能

- 跨平台发现 `sclang`（macOS、Windows、Linux，及 `PATH` 回退）
- 单会话 driver 状态机：`engine_missing -> idle -> booting -> ready -> busy -> degraded -> stopping -> stopped`
- 所有动作统一返回：`success`、`state`、`phase`、`session_id`、`recoverable`、`error_kind`、`summary`、`raw_output`，以及可选的 `session`、`artifact`、`compliance`
- 恢复面：`sc_stop`、`sc_reset`、`sc_reboot`、`sc_reclaim`
- Pilot MCP 工具：`sc_check`、`sc_status`、`sc_health`、`sc_eval`、`sc_run_file`、`sc_logs`、`sc_render`、`sc_render_nrt`、`sc_stop`、`sc_reset`、`sc_reboot`、`sc_reclaim`
- CLI：`check`、`status`、`health`、`eval`、`run`、`logs`、`render`、`render-nrt`、`stop`、`reset`、`reboot`、`reclaim`
- Workflow 工作流面：`plan-workflow`、`run-probe`、`summarize-session`、`candidate-action`、`memory-summary`
- 治理面：`prepare-handoff`、`audit-session`，以及对应 MCP tools，用于受约束的 agent loop
- 实时草稿渲染链路：boot/record/verify/teardown
- final-quality NRT 渲染链路：capability-aware engine 选择、显式 draft/NRT 区分、WAV 元数据捕获
- Vitest 覆盖协议辅助函数、运行时、CLI、Pilot 路由，以及可选 live smoke

## 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | 22+ |
| SuperCollider | 3.13+（`sclang` 在 `PATH` 或默认安装路径） |

默认 `sclang` 路径：

| 平台 | 路径 |
|------|------|
| macOS | `/Applications/SuperCollider.app/Contents/MacOS/sclang` |
| Windows | `C:\Program Files\SuperCollider\sclang.exe` |
| Linux | `/usr/bin/sclang` 或 `/usr/local/bin/sclang` |

## 安装

```bash
git clone https://github.com/Bayern99/supercollider-pilot.git
cd supercollider-pilot
npm install
npm run build
```

验证 SuperCollider 是否可用：

```bash
node dist/cli.js check
```

已安装时的示例输出：结构化 JSON，包含 `success`、`state`、`summary`。

可选全局安装：

```bash
npm link
scctl check
```

## 在 consumer 项目中使用

多数场景在 **consumer 工作区**（音乐应用、研究 repo 等）通过 MCP 连接 Pilot，**不必**把本仓库源码 vendoring 进业务代码。

| 组件 | 是否必须在 consumer 工作区 | 说明 |
|------|---------------------------|------|
| Pilot 程序（`dist/mcp/server.js`、`scctl`） | 否 | 任意路径安装；MCP 配置写绝对路径 |
| Archive、governed marker | 是 | 写在 **Agent 工作区根**：`.scctl/archive/`、`.scctl/governed-role` |
| KB（`docs/superpowers/kb/`） | 需要有效 handoff 时 | 从 consumer 的 `cwd` 读取；缺失则 `kb_snapshot` 为空 |
| Agent skills（`.agents/skills/scctl-*`） | 推荐 | 复制或链接；仅连 MCP 不会自动加载 |
| IDE hooks | 可选硬约束 | consumer 配置 `.cursor/hooks.json` |

Pilot 为**独立 OS 进程**（Node MCP + 按需 `sclang` / `scsynth`），不进入业务应用 runtime。空闲开销小；渲染时占用本机 CPU/内存。`.scctl/` 建议加入 `.gitignore`。

**一次性接入 consumer 项目：**

```bash
/absolute/path/to/supercollider-pilot/scripts/bootstrap-consumer-project.sh /absolute/path/to/your-project
```

将 KB、roles、`.agents/skills/scctl-*`、hooks 写入 consumer 工作区，再配置 MCP。详见 [docs/guides/consumer-bootstrap.zh-CN.md](docs/guides/consumer-bootstrap.zh-CN.md)。

**Agent 应用 MCP**， governed loop 不要用 shell CLI：原生 tool call、长驻 `sclang`、可选 MCP preflight。**CLI** 供人工、冒烟与 CI。

使用指南：[docs/guides/governed-pilot-tutorial.zh-CN.md](docs/guides/governed-pilot-tutorial.zh-CN.md)  
**新项目快速接入（清单 + bootstrap 脚本）：** [docs/guides/consumer-bootstrap.zh-CN.md](docs/guides/consumer-bootstrap.zh-CN.md)  
操作手册：[docs/operator-runbook.zh-CN.md](docs/operator-runbook.zh-CN.md) · [English](docs/operator-runbook.md)

## 使用

### CLI

```bash
# 检查引擎可达性
node dist/cli.js check

# 查看当前会话状态
node dist/cli.js status
node dist/cli.js health

# 执行内联代码
node dist/cli.js eval "{ SinOsc.ar(440, 0, 0.05) }.play;"

# 运行 .scd
node dist/cli.js run path/to/script.scd
node dist/cli.js run path/to/script.scd --task-tag sc-probe

# 查看当前日志缓冲
node dist/cli.js logs --tail 500

# 录制为 WAV
node dist/cli.js render path/to/script.scd -o /tmp/out.wav -d 5
node dist/cli.js render path/to/script.scd -o /tmp/out.wav -d 5 --task-tag sc-audio-generation

# final-quality NRT 渲染（必须用绝对 .scd 路径）
node dist/cli.js render-nrt /absolute/path/to/final-nrt.scd -o /tmp/final.wav
node dist/cli.js render-nrt /absolute/path/to/final-nrt.scd -o /tmp/final.wav --engine supernova --sample-format double

# 恢复动作
node dist/cli.js reset
node dist/cli.js reboot
node dist/cli.js reclaim

# 工作流规划与 probe 执行
node dist/cli.js plan-workflow --context '{"task_tag":"sc-probe","goal":"inspect a new timbral direction"}'
node dist/cli.js run-probe --spec '{"mode":"run_file","path":"/absolute/path/to/probe.scd","task_tag":"sc-probe"}'
node dist/cli.js summarize-session --input '{"session_id":"session-1","task":"probe a texture","outcome":"mixed","preserved_items":["slow envelope contour"],"failures":["render clipped"],"notes":["keep the modulation shape"]}'
node dist/cli.js candidate-action --input '{"session_id":"session-1","action":"create_draft","candidate_id":"cand-1","name":"grain-cloud-a","source_probe_id":"probe-1","summary":"promising density"}'
node dist/cli.js memory-summary --limit 10

# 治理层 handoff 与 audit
node dist/cli.js prepare-handoff --input '{"task_id":"task-1","task_tag":"sc-audio-generation","goal":"render a Zhou Yi texture study","requested_outcome":"explore"}'
node dist/cli.js audit-session --input '{"session_id":"session-1","task_tag":"sc-audio-generation"}'
```

### MCP 与 CLI

| | **MCP**（Agent 默认） | **CLI**（人工 / 脚本） |
|---|----------------------|------------------------|
| 入口 | Cursor、Claude Desktop 等 MCP 客户端 | `node dist/cli.js …` 或 `scctl …` |
| 会话 | 长驻进程复用 `ScDriver` / `sclang` | 每次命令新进程 |
| Governed RBAC | 在 MCP `env` 设 `SCCTL_GOVERNED_ROLE` 等 | 命令前设同样 env |
| IDE preflight | 配置后对 MCP 工具有效 | 对 shell 命令无效 |

仅 MCP、不设 env / hooks / skills 时，工具仍可用，但默认 **operator/debug** 面，raw runtime 不硬拦。

### Pilot 服务（MCP）

stdio 方式启动 Pilot MCP 服务：

```bash
node dist/mcp/server.js
```

**Claude Desktop / Cursor** — MCP 配置（`dist/mcp/server.js` 用**绝对路径**；`cwd` 为打开的工作区）：

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

operator/debug 时不设 `SCCTL_GOVERNED_ROLE`。可选：将 `.agents/skills/scctl-*` 与 `hooks/hooks.json` 复制到 consumer 工作区。

| 工具 | 参数 | 说明 |
|------|------|------|
| `sc_check` | — | 验证引擎路径与解释器可达性 |
| `sc_status` | — | 返回当前 driver 会话快照 |
| `sc_health` | — | 探测活动会话健康状态与 server ready 状态 |
| `sc_eval` | `code`（必填） | 在活动会话中执行内联代码 |
| `sc_run_file` | `path`（必填），`task_tag`（可选） | 读取并执行 `.scd` 文件 |
| `sc_logs` | `tail`（可选） | 返回当前日志缓冲 |
| `sc_render` | `out`（必填），`path` 或 `code`，`duration`，`task_tag`（可选） | 产出草稿 WAV，并在结束后关闭会话 |
| `sc_render_nrt` | `path`（必填）、`out`（必填）、`duration`、`engine_preference`、`sample_format`、`task_tag`（可选） | 从绝对 `.scd` 源文件走 NRT，产出 final-quality WAV |
| `sc_stop` | — | 停止当前会话 |
| `sc_reset` | — | 尽量保留会话，仅清理当前状态 |
| `sc_reboot` | — | 关闭并重建一个 fresh ready 会话 |
| `sc_reclaim` | — | 从 degraded/脏会话中回收并重建本地会话 |

新增的受治理 workflow / orchestration 工具：

| 工具 | 参数 | 说明 |
|------|------|------|
| `sc_plan_workflow` | `spec` 或 `context` | 选择 workflow，并返回 prompts 与 path expectation |
| `sc_run_probe` | `spec`（必填） | 通过 `ScDriver` 校验并执行 `ProbeSpec` |
| `sc_summarize_session` | 结构化 summary payload | 将 session summary append 到 archive |
| `sc_candidate_action` | 结构化 lifecycle payload | 执行 candidate 生命周期或 review 动作 |
| `sc_memory_summary` | `session_id`、`candidate_id`、`limit`（均可选） | 从 archive 构建 project-level memory summary |
| `sc_prepare_handoff` | task envelope | 生成 manager / builder / critic packets 与 KB snapshot |
| `sc_audit_session` | `session_id`（必填）、`task_tag`、`candidate_id` | 审计一次受治理 session，并给出 next step |

### Agent 工作流

#### Governed loop walkthrough

受治理的默认创作循环（详见 [docs/operator-runbook.md](docs/operator-runbook.md)）：

```text
prepare-handoff → run-probe → summarize-session → candidate-action / add_review → audit-session → memory-summary
```

`audit-session` 成功后会向 `.scctl/archive/archive-events.jsonl` 追加 `session_audit` 记录。

#### Task tags

| Task tag | 终端动作 | 需要 `.scd` 源 | 需要 render artifact | 需要 review note |
|----------|----------|----------------|----------------------|------------------|
| `sc-probe` | 无 | 否 | 否 | 否 |
| `sc-audio-generation` | `render` 或 `render_nrt` | 是 | 是 | 是 |
| `sc-render-review` | `render` 或 `render_nrt` | 否 | 是 | 是 |

规范来源：[docs/design/route-enforcement-rules.md](docs/design/route-enforcement-rules.md) 与 `src/harness/policies.ts`。

#### Draft vs final NRT

- **Draft**：`render` / `sc_render` — 快速试听、迭代；会话结束后关闭。
- **Final NRT**：`render-nrt` / `sc_render_nrt` — 终稿质量；需要绝对路径的 NRT `.scd` 源（见 `sc/families/*/final-nrt.scd`）。
- 声明 `quality.render_tier: final_nrt` 的任务不能用 draft artifact 通过 `audit-session` 闭环。

典型设计阶段循环（operator/debug）：`sc_check` → `sc_status`/`sc_health` → `sc_eval` 或 `sc_run_file` → `sc_logs`（出错时）→ `sc_render` → `sc_reclaim` 或 `sc_stop`。

- `.scd` 与 WAV 输出请使用**绝对路径**（无默认工作目录）。
- SuperCollider 侧只写 SynthDef、播放与渲染片段；业务逻辑放在项目其他层。
- 该 driver 是**单会话、本地优先**的；恢复请用 `sc_reset`、`sc_reboot`、`sc_reclaim`，不要只靠 post 文本猜状态。
- CLI 输出为结构化 JSON；原始 SuperCollider 输出保存在 `raw_output`。
- `run` 和 `render` 现在支持可选 `task_tag`。传入后，Pilot 会返回 `compliance` 结果，记录调用路径、source 类型，以及任务是否满足 artifact 要求。
- `artifact` 现在带有验证信息，可以区分“渲染流程跑过了”和“确实产出了有效、非空的 WAV 文件”。
- `check` 和 `health` 现在会返回 `sclang`、`scsynth`、`supernova`、extensions、Quarks、`sc3-plugins`、NRT 可用性等 capability 事实。
- 原始 `sc_eval`、`sc_run_file`、`sc_render` 继续保留为 operator/debug surface；`sc_render_nrt` 是显式的 final-quality runtime surface。正式受治理创作流程默认走上面的 workflow tools。

设计说明：

- [docs/guides/governed-pilot-tutorial.zh-CN.md](docs/guides/governed-pilot-tutorial.zh-CN.md) — 使用流、consumer 接入、Prompt
- [docs/guides/agent-skills-spec.zh-CN.md](docs/guides/agent-skills-spec.zh-CN.md) — `.agents/skills/` 规范
- [AGENTS.md](AGENTS.md) — 贡献者模块边界
- [docs/operator-runbook.zh-CN.md](docs/operator-runbook.zh-CN.md) · [English](docs/operator-runbook.md)
- [docs/design/scctl-scope-enhancement.md](docs/design/scctl-scope-enhancement.md)
- [docs/design/boundary-freeze.md](docs/design/boundary-freeze.md)
- [docs/design/route-enforcement-rules.md](docs/design/route-enforcement-rules.md)
- [docs/design/primitive-lab-spec.md](docs/design/primitive-lab-spec.md)
- [docs/design/candidate-lifecycle.md](docs/design/candidate-lifecycle.md)
- [docs/design/eval-rubric.md](docs/design/eval-rubric.md)
- [docs/design/planner-spec.md](docs/design/planner-spec.md)

### 冒烟测试（需本机安装 SuperCollider）

```bash
npm run build
node dist/cli.js check    # 应看到带 success/state/summary 的 JSON
node dist/cli.js render fixtures/smoke/sine-play.scd -o /tmp/scctl-smoke.wav -d 2
test -s /tmp/scctl-smoke.wav
```

本机失败请参阅 [docs/smoke-troubleshooting.md](docs/smoke-troubleshooting.md)。

可选 live integration：

```bash
npm run test:live
```

### 示例脚本

```bash
node play-music.js    # 播放五声音阶示例（约 10 秒）
node record-music.js  # 录制到 ./music.wav
```

## 架构

### 使用流（governed 任务）

```text
Prompt → Agent（按需读 .agents/skills）
      → Harness（SCCTL_GOVERNED_ROLE、hooks、completion-rules）
      → MCP / CLI → Pilot 编排 / 工作流 / 运行时
      → sclang / scsynth + .scctl/archive
      → 评审环（听感、critic、audit）
```

### Pilot 内部分层（代码）

```text
Agent 客户端
       │
       ▼
src/mcp/server.ts  or  src/cli.ts
       │
       ├── orchestration / workflow（handoff、probe、audit）
       └── ScDriver (src/runtime/driver.ts)
               ▼
       SclangController → sclang → scsynth → 音频输出
```

要点：

- 任意时刻只有一个本地活动会话
- 仅串行执行——拒绝并发脚本运行
- success/failure 由 completion protocol 与原始 SC 错误检测共同决定，不再只靠 post 文本猜测
- 关闭时发送 `CmdPeriod.run; Server.killAll;`，必要时 SIGKILL

背景：[docs/design/control-approach-notes.md](docs/design/control-approach-notes.md)

## 安全

`sc_eval` 会执行任意 SuperCollider 代码，可访问本机文件与进程。仅配合可信的本地 Pilot/MCP 客户端使用，勿将 Pilot 服务暴露到网络。

详见 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm run typecheck
npm run build
npm test
npm run test:live   # 可选，需要本机 SuperCollider
```

贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

ISC — 见 [LICENSE](LICENSE)。
