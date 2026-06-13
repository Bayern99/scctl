# SuperCollider Pilot 使用指南

本文说明如何通过 Agent 调用 Pilot（`scctl`）完成 SuperCollider 音频任务。

- **在新项目里接入 Pilot（先读这个）：** [consumer-bootstrap.zh-CN.md](./consumer-bootstrap.zh-CN.md) — 拉哪些文件、bootstrap 脚本、MCP 配置、每个新项目 checklist  
- 命令参数：[operator-runbook.zh-CN.md](../operator-runbook.zh-CN.md)  
- 修改 Pilot 源码：[AGENTS.md](../../AGENTS.md)

---

## 系统组成

**SuperCollider** 负责发声：`sclang` 执行代码，`scsynth` 渲染音频。

**Pilot（`scctl`）** 是 Agent 与 SuperCollider 之间的固定接口。每次调用返回结构化结果（`success`、`session_id`、`artifact`、`compliance` 等），并将 probe、review、audit 等事件写入 append-only archive（`.scctl/archive/archive-events.jsonl`）。没有 Pilot，Agent 无法稳定证明「SuperCollider 已执行、产物在何处」。

**Workflow / Orchestration** 定义任务如何立项、实验、总结、审计。Governed 任务从 `sc_prepare_handoff` 开始，以 `sc_audit_session` 结束；中间步骤见下文「Governed 工作流」。

**Harness** 在 MCP/CLI 入口和 Cursor hooks 层 enforce 工具 allowlist（`SCCTL_GOVERNED_ROLE`、`hooks/scctl-governed-preflight.js`）。Completion 规则（`src/harness/completion-rules.ts`）在带 `task_tag` 时附加 `compliance` 快照。

**KB**（`docs/superpowers/kb/`）在 handoff 时以 `kb_snapshot` 注入 Agent：项目规则、渲染检查项、允许的基础 primitive、已知失败模式、角色策略 JSON。

**Skills**（`.agents/skills/scctl-*`）是 Agent 侧操作手册，与 KB 和 Harness 分工：Skills 指导工具选择顺序；Harness 拦截越权调用；Pilot 执行 SuperCollider。

控制链固定为 `Agent → Pilot → SuperCollider`（KB `project-rules.md`）。

---

## 使用时怎么走

一次 governed 任务从 Prompt 到可审计收尾，控制链如下：

```text
Prompt（任务描述、听感反馈、是否定稿）
        │
        ▼
Agent（读 Skills 按需；读 handoff 后的 kb_snapshot）
        │
        ▼
Harness（SCCTL_GOVERNED_ROLE · hooks · completion-rules）
        │  硬约束：越权 raw 工具会被拒；final_nrt 禁止 draft 闭环
        ▼
MCP / CLI → Pilot（sc_prepare_handoff · sc_run_probe · … · sc_audit_session）
        │
        ├── SuperCollider（sclang / scsynth）→ WAV / 日志
        └── Archive（.scctl/archive/archive-events.jsonl）
        │
        ▼
Review 环（听感反馈 → 再 probe / render；critic 评审；audit 核对轨迹）
```

**立项**：`sc_prepare_handoff` 注入 KB、写入 `.scctl/governed-role`、返回推荐步骤。  
**迭代**：`sc_run_probe`（及可选 `sc_render` 试听）反复执行；听感修改写在 Prompt 里，Agent 改 `.scd` 再 probe。  
**收尾**：`sc_summarize_session` → `sc_audit_session`（定稿任务还须满足 `task_tag` 对 artifact 的要求，见下文「工作模式」）。

Skills 只影响 Agent 是否走对顺序；不能替代 Harness。没有 Pilot 返回的 `session_id` 与 archive 记录，任务不算 governed closure。

---

## 在其他项目里接入

Consumer 项目（非本仓库）的逐步清单、bootstrap 脚本与 MCP 模板见 **[consumer-bootstrap.zh-CN.md](./consumer-bootstrap.zh-CN.md)**。

要点：Pilot 二进制留在 `PILOT_ROOT`；consumer 内要有 KB、skills、（可选）hooks；archive 写在 consumer 的 `.scctl/`；Agent 用 MCP 而非 shell CLI。

---

## Pilot 内部分层

Pilot 源码按职责分层（与上一节「使用时怎么走」是同一系统的不同剖面）：

```text
Agent ─ MCP / CLI（src/mcp/server.ts · src/cli.ts）
        │
        ├── Orchestration ─ sc_prepare_handoff · sc_audit_session
        │       └── kb_snapshot · role_packets · .scctl/governed-role
        │
        ├── Workflow ─ sc_plan_workflow · sc_run_probe · sc_summarize_session
        │              · sc_candidate_action · sc_memory_summary
        │
        └── Runtime ─ ScDriver → sclang / scsynth
                └── DriverResult + archive JSONL
```

**执行层**（`src/runtime/*`）直接驱动 SuperCollider：`sc_eval`、`sc_run_file`、`sc_render`、`sc_render_nrt` 等。

**治理层**（`src/orchestration/*`、`src/workflow/*`）管理任务生命周期：`sc_prepare_handoff` 立项并注入规则；`sc_run_probe` 在 lab 约束下跑实验；`sc_audit_session` 检查轨迹并写入 `session_audit`。

探索阶段可多次 `sc_run_probe`；需要可审计 closure 时，须完成 handoff 与 audit，且满足 `task_tag` 对 artifact 的要求。

### Harness 机制

| 机制 | 位置 | 作用 |
|------|------|------|
| 角色 allowlist | `role-policies.ts` · `role-tool-policies.json` | `SCCTL_GOVERNED_ROLE=manager\|builder\|critic` 时在入口拒绝越权工具 |
| Compliance | `completion-rules.ts` | `task_tag` 决定 render/review 是否满足 policy |
| `SCCTL_FINAL_NRT` | 环境变量 | governed 下拒绝 draft `sc_render` |
| Governed marker | `.scctl/governed-role` | `prepare_handoff` 写入；hooks 读取 |
| MCP preflight | `hooks/scctl-governed-preflight.js` | 拦截 raw runtime MCP |
| Session start | `hooks/scctl-session-start.js` | 会话开始时提示 governed 状态 |

---

## 术语

| 术语 | 定义 |
|------|------|
| Probe | `sc_run_probe` 执行的实验性 `.scd`，用于验证方向 |
| Draft render | `sc_render` 产出试听 WAV，latency 低，非 final 定稿 |
| NRT render | `sc_render_nrt` 离线最终渲染；`final_nrt` 任务 closure 需要此 tier |
| Handoff | `sc_prepare_handoff`：返回 `workflow_plan`、`kb_snapshot`、`role_packets` |
| task_tag | `sc-probe` · `sc-audio-generation` · `sc-render-review`；决定 compliance 字段 |
| Archive | `.scctl/archive/archive-events.jsonl`；记录 `probe_run`、`session_summary`、`session_audit` 等 |

---

## 项目 Skills（`.agents/skills/`）

基础设施 skill 共六个；音乐语义类 skill（卦象映射等）在下游 consumer 项目维护，不在本仓库。

| Skill | Agent 加载条件 | 内容 |
|-------|----------------|------|
| `scctl-governed-loop` | 任务 closure、governed 会话、选择 workflow 与 raw 工具 | 推荐环顺序；禁止 raw 捷径闭环 |
| `scctl-draft-vs-final` | draft 试听与 final 定稿、`final_nrt` | draft / NRT 边界 |
| `scctl-operator-debug` | smoke、debug、显式非 governed 任务 | `sc_eval`、`check`、带 tag 的 `run` |
| `scctl-role-handoff` | 窄角色或 handoff 之后 | 指向 `roles/*.md` 与 policy JSON |
| `scctl-probe-lifecycle` | candidate、review、archive | probe → summarize → review → candidate |
| `scctl-module-boundaries` | 修改本仓库 TypeScript | `AGENTS.md` 模块边界 |

维护规范：[agent-skills-spec.zh-CN.md](./agent-skills-spec.zh-CN.md)

---

## 知识库（handoff 注入）

| 文件 | 内容 |
|------|------|
| `project-rules.md` | 控制链、范围冻结 |
| `render-checklist.md` | 渲染与 summarize、review gate |
| `evaluation-rubric.md` | 路径与 artifact 合规 |
| `allowed-primitives.md` | 基础 UGen / pattern；`sc/families/` 索引 |
| `known-failures.md` | 已知失败签名 |
| `role-tool-policies.json` | 三角色工具表；与 Harness 同源 |

Handoff 成功后 Agent 收到 `kb_snapshot`。需要核对规则时，要求 Agent 摘录其中与当前任务相关的条目即可。

---

## Governed 工作流

`src/orchestration/service.ts` 中的 `RECOMMENDED_LOOP`：

```text
prepare_handoff → run_probe → summarize_session
  → add_review / candidate_action → audit_session → memory_summary
```

| 步骤 | MCP 工具 | 产出 |
|------|----------|------|
| 立项 | `sc_prepare_handoff` | `workflow_plan`、`kb_snapshot`、`role_packets`；写入 `.scctl/governed-role` |
| 实验 | `sc_run_probe` | `probe_run` archive；可选 WAV artifact |
| 总结 | `sc_summarize_session` | `session_summary` |
| 评审 / 候选 | `sc_candidate_action` | `candidate_lifecycle` 或 review note |
| 审计 | `sc_audit_session` | `session_audit`；compliance 检查 |
| 记忆 | `sc_memory_summary` | 供下次 handoff 的 memory excerpt |

跳过 handoff：无 KB 注入，audit 依据不完整。跳过 audit：session 无 `session_audit` 记录，不能作为 governed closure 的证据。

### 窄角色（`SCCTL_GOVERNED_ROLE`）

| 角色 | 文档 | 允许的工具 |
|------|------|------------|
| manager | `roles/manager.md` | handoff、summarize、candidate、memory |
| builder | `roles/sc-builder.md` | `sc_run_probe`；声明 `final_nrt` 时 `sc_render_nrt` |
| critic | `roles/critic.md` | `add_review`、`sc_audit_session` |

---

## MCP 工具

### Runtime

| 工具 | 用途 |
|------|------|
| `sc_check` · `sc_status` · `sc_health` | 引擎状态与 NRT 能力 |
| `sc_eval` · `sc_run_file` | 内联或单文件执行 |
| `sc_render` · `sc_render_nrt` | draft / final WAV |
| `sc_logs` | 日志 |
| `sc_stop` · `sc_reset` · `sc_reboot` · `sc_reclaim` | 恢复 |

默认不阻断；governed 模式或 hooks 可能拒绝部分 raw 工具。

### Workflow · Orchestration

| 工具 | 用途 |
|------|------|
| `sc_plan_workflow` | 生成计划 |
| `sc_run_probe` | Governed 实验 |
| `sc_summarize_session` | Session 摘要 |
| `sc_candidate_action` | 候选与 review |
| `sc_memory_summary` | 跨 session 记忆 |
| `sc_prepare_handoff` | 立项 |
| `sc_audit_session` | 审计 |

CLI 为 kebab-case 同名命令，见 operator-runbook。

---

## 工作模式

三种模式互斥；Prompt 中应指明是哪一种。

**通路验证** — 确认 SuperCollider 与 Pilot 可用。使用 `sc_check`、`sc_health`、`sc_eval` 或 `sc_run_file`。不写 archive，不执行 handoff / audit。

**探索（`task_tag: sc-probe`）** — 验证 timbre、织体、参数方向。Handoff 后反复 `sc_run_probe`；听感不满意则改 `.scd` 再 probe。结束前 `sc_summarize_session` 与 `sc_audit_session`。Probe 可不产出 final NRT；archive 记录 `probe_run` 等。

**生成与定稿（`task_tag: sc-audio-generation`）** — 需要可验证的 render artifact。在探索基础上，terminal action 为 `render` 或 `render_nrt`。声明 `final_nrt` 时，draft WAV 不满足 closure（`completion-rules.ts`）；须 `sc_render_nrt` 且 audit 通过。Policy 要求 `.scd` 源路径、非空 WAV、review note。

---

## Prompt 与 Pilot 结果

写 Prompt 时指定：**模式**（上节三者之一）、**声音目标**、**是否 final_nrt**、**要求 Agent 回传哪些字段**（至少 `success`、`session_id`；有渲染则 `artifact.path`）。

| 意图 | 要求 Agent 调用的工具 | 核对字段 |
|------|------------------------|----------|
| 检查引擎 | `sc_check`、`sc_health` | `success`；capabilities 含 NRT 与否 |
| 开探索任务 | `sc_prepare_handoff`（`task_tag: sc-probe`） | `task_id`、`kb_snapshot`；存在 `.scctl/governed-role` |
| 跑 family probe | `sc_run_probe`，`file_path` 为 `sc/families/<name>/probe.scd` 的绝对路径 | 新 `session_id`；archive `probe_run` |
| 听感修改后再试 | 改 scd 后再次 `sc_run_probe` | 新 probe 记录；新 WAV 路径 |
| 记录 session | `sc_summarize_session` | archive `session_summary` |
| 保留方向 | `sc_candidate_action`（`create_draft`） | `candidate_lifecycle` |
| 收尾 | `sc_audit_session` | `session_audit` |
| 试听 | `sc_render` | draft WAV 路径；不用于 final closure |
| 定稿 | `sc_render_nrt` 或 probe `mode: render_nrt` | NRT WAV；audit 通过 |
| 核实执行 | — | 列出各步 `success`、`artifact.path` 或 `failure_reasons` |

### Prompt 模板

**探索**

```text
SuperCollider Pilot MCP，sc-probe governed 流程。

目标：【30s 暗色 drone，慢扫频，无 percussive attack】

执行：
1. sc_prepare_handoff（requested_outcome: explore）
2. sc_run_probe → sc/families/【family】/probe.scd（绝对路径）
3. 每步返回 success、session_id、artifact.path（如有）

我听完反馈后再 summarize / audit。禁止 sc_eval 闭环。
```

**定稿（final_nrt）**

```text
task_tag sc-audio-generation，render_tier final_nrt。

handoff → probe 迭代（我反馈听感）→ draft 仅试听 → 确认后 sc_render_nrt → summarize → sc_audit_session。
draft 不得作为最终 artifact。
```

**通路**

```text
sc_check、sc_health、sc_eval（440Hz 短音）。无 handoff，无 audit。
```

**核实**

```text
列出本轮 sc_run_probe / sc_render / sc_render_nrt 的 session_id、success、artifact.path；失败则贴 failure_reasons。
```

---

## Starter 资产（`sc/families/`）

| Family | 说明 |
|--------|------|
| `sustained-tonal-carrier` | 持续 tonal 载体 |
| `filtered-noise-breath-texture` | 滤波噪声 / 呼吸质感 |
| `sparse-pulse-lattice-event` | 稀疏脉冲点阵 |

各含 `probe.scd`；部分含 `final-nrt.scd`。列表与 KB `allowed-primitives.md` 同步；可增改 family，archive 保留历史。

---

## 安装与接入

在本仓库开发 Pilot：`npm install && npm run build`，`node dist/cli.js check`。

在 **consumer 项目**接入：运行 `scripts/bootstrap-consumer-project.sh`，再配 MCP。完整步骤见 [consumer-bootstrap.zh-CN.md](./consumer-bootstrap.zh-CN.md)。

故障见 [smoke-troubleshooting.md](../smoke-troubleshooting.md)。

---

## 故障

| 现象 | 处理 |
|------|------|
| 声称已渲染但无文件 | 要求 `artifact.path` 或 `verification.failure_reasons` |
| governed 下 raw 工具被拒 | 改用 `sc_run_probe`；检查 MCP `env` 与 `SCCTL_GOVERNED_ROLE` |
| consumer 项目 handoff 无规则 | 在 consumer 建 `docs/superpowers/kb/` |
| 仅 MCP 无 hooks，Agent 走 raw 捷径 | 设 `SCCTL_GOVERNED_ROLE`；复制 skills / hooks |
| audit 失败 | 对照 task_tag 补 summarize / render / review |
| `engine_missing` | 安装 SuperCollider；`sc_reboot` |
| draft 用于 final 任务 | 指定 `sc_render_nrt`；设 `SCCTL_FINAL_NRT` 若需硬拒 draft |

---

## 参考

- [consumer-bootstrap.zh-CN.md](./consumer-bootstrap.zh-CN.md) — **新项目接入清单与 bootstrap 脚本**
- [README.zh-CN.md](../../README.zh-CN.md) · [README.md](../../README.md)
- [operator-runbook.zh-CN.md](../operator-runbook.zh-CN.md) — CLI、环境变量
- [route-enforcement-rules.md](../design/route-enforcement-rules.md) — compliance / RBAC
- [status.md](../superpowers/status.md) — 当前能力边界
