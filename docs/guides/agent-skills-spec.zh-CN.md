# supercollider-pilot Agent Skills 写作规范

Date: 2026-06-13  
Audience: 维护 `.agents/skills/` 的开发者与 agent  
Phase: 7.2

## 1. 上下文分层

| 层级 | 位置 | 职责 | 加载时机 |
|------|------|------|----------|
| 制度 / 硬约束 | `src/harness/*`, `src/transport/governance.ts`, `hooks/` | RBAC、completion、hooks | env + MCP 调用时 |
| 改代码说明书 | `AGENTS.md` | 模块边界、路线图、测试门禁 | coding agent 每次会话 |
| 任务态 KB | `docs/superpowers/kb/*` | 规则清单、rubric | `prepare_handoff` → `kb_snapshot` |
| 窄角色合同 | `docs/superpowers/roles/*.md`, `role-tool-policies.json` | allow/forbid tools | handoff + `SCCTL_GOVERNED_ROLE` |
| 人类操作手册 | `docs/operator-runbook.zh-CN.md`（英文：`operator-runbook.md`） | operator/debug vs governed | 人工查阅 |
| Skills | `.agents/skills/scctl-*` | 操作流程、判断分支、指针 | agent 按需触发 |

```text
skills = 辅助手册（judgment + procedure）
harness  = 制度（enforcement）
KB       = handoff 时注入的任务态事实
AGENTS.md = 改本仓库代码的边界
```

### 放哪决策树

1. **能代码/hook 强制？** → harness / hooks  
2. **仅改本 repo 代码？** → `AGENTS.md` 一句 + 链接  
3. **handoff 任务态事实？** → `docs/superpowers/kb/`  
4. **多步操作、易走错路？** → `.agents/skills/`  
5. **否则** → runbook 或 `docs/guides/governed-pilot-tutorial.zh-CN.md`

## 2. 目录布局

```
.agents/skills/
  scctl-<name>/
    SKILL.md                 # 必需
    references/              # 可选，>100 行细节放这里

docs/guides/
  agent-skills-spec.zh-CN.md
  governed-pilot-tutorial.zh-CN.md
  skill-eval-workspace/      # skill TDD 评测产物（可 gitignore 大体积 iteration）
```

项目 skill **只**放在 `.agents/skills/`。IDE 专用配置（如 Cursor hooks）留在 `.cursor/`；不把 skills 与单一 IDE 目录绑定。个人全局 skill 仍用 `~/.agents/skills/`，勿与仓库根 `skills/` 混用。

## 3. SKILL.md 模板

```markdown
---
name: scctl-example
description: Use when [具体触发症状与场景，第三人称，不写 workflow 摘要]
---

# scctl-example

## Overview
一两句核心原则。

## When to Use
- 症状 / 场景 bullet
- When NOT to use

## Quick Reference
| 情况 | 动作 | Canonical 指针 |
|------|------|----------------|

## Common Mistakes
| 借口 | 现实 |
|------|------|
```

### Description（CSO）

- 以 `Use when` 开头，第三人称  
- **只写触发条件**，不写 `prepare_handoff then run_probe...` 这类流程摘要  
- 含可搜索关键词：`governed`, `final_nrt`, `sc_render`, `prepare_handoff`, `audit_session`

### 类型

| 类型 | 示例 skill | 测试重点 |
|------|------------|----------|
| technique | `scctl-governed-loop` | 能否走对工具链 |
| discipline | `scctl-draft-vs-final` | 压力下是否违规闭环 |
| pattern | `scctl-role-handoff` | 能否读 canonical role 文件 |
| reference | `scctl-supercollider-kb`（可选） | 能否找到外链与 `sc/` |

## 4. 禁止项

- 复制 `role-tool-policies.json` 或 KB 全文进 skill  
- 用 skill 替代 hooks / `SCCTL_GOVERNED_ROLE` 硬拦截  
- 内联 >300 行 SuperCollider 教程（链 [doc.sccode.org](https://doc.sccode.org) + `sc/`）  
- 把 orchestration 流程塞进 `AGENTS.md` 或 runtime 模块  
- 未跑 baseline eval 就批量新增 skill（Iron Law）

## 5. 与 harness 联动

| 机制 | 文件 | 作用 |
|------|------|------|
| governed marker | `.scctl/governed-role` | `prepare_handoff` 写入；含 `final_nrt`, `task_id` |
| MCP 预检 | `hooks/scctl-governed-preflight.js` | `beforeMCPExecution` 阻断 raw runtime |
| 会话引导 | `hooks/scctl-session-start.js` | `sessionStart` 读 marker，返回 `additional_context` |
| 进程 RBAC | `SCCTL_GOVERNED_ROLE`, `SCCTL_FINAL_NRT` | MCP/CLI in-process 拦截 |

`sessionStart` 的 `additional_context` 在部分 Cursor 版本可能不稳定注入；skill 正文要求 agent **主动读取** `.scctl/governed-role` 作为 fallback。

## 6. TDD 流程（每个 skill）

1. 写 2–3 个 pressure prompt → `docs/guides/skill-eval-workspace/<skill>/evals/evals.json`  
2. 跑 without_skill baseline，记录 rationalizations  
3. 写最小 SKILL.md 堵住 baseline 借口  
4. 写 assertions（discipline skill 必须可客观检查）  
5. with_skill 复跑 → REFACTOR  
6. 可选：`skill-creator` 的 `generate_review.py --static`

## 7. 维护规则

- KB / roles / policies 变更：**只改 canonical 源**，skill 内保留一行指针  
- 新增 governed 工具：改 `role-policies.ts` + JSON，skill 不复制列表  
- `node scripts/harness-audit.js skills` 必须通过

## 8. 全局 skill 引用（不内联）

- `agent-harness-construction` — action space / observation 设计  
- `create-hook` — 扩展 hooks  
- `verification-before-completion` — 声称完成前验证  

## 9. 范围边界

**本仓库 Phase 7.2** 只维护 `scctl-*` 基础设施 skill。  
下游音乐项目 skill（如 `Pattern-Logic-Composer`）在 consumer repo 编写，见 `docs/design/zhouyi-supercollider-agent-assessment.zh-CN.md` §12。

---

## Decision Log（multi-agent-brainstorming 评审）

Date: 2026-06-13  
Disposition: **APPROVED**

| 决策 | 备选 | 异议 | 决议 |
|------|------|------|------|
| skill 路径 `.agents/skills/` | `.cursor/skills/`、根目录 `skills/` | 应 agent 中立、可跨 IDE | **2026-06-13 修订**：迁至 `.agents/skills/` |
| KB 不 session preload | 全文注入 AGENTS | token 爆炸 | 仅 handoff snapshot |
| 6 个 scctl skill 上限 | 一次性 12+ | 维护成本 | P0–P2 共 6 个；P3 KB 可选 |
| sessionStart 软引导 | 仅 hooks 硬阻断 | 注入不可靠 | 双轨：hook + skill 读 marker |
| 教程与 skill 分离 | 合并进 README | 受众混淆 | `docs/guides/` 教程；README 不动 |
| bypass 拦不住时回流 harness | 加长 skill MUST | skill 不能替代制度 | Skeptic 异议采纳：违规路径加 hook/RBAC，不单靠 prose |

**Skeptic 保留意见：** agent 仍可能在无 governed env 时用 raw tools「完成」任务 — 由 `task_tag` compliance + 审计文化补充，不在 skill 层假装硬拦截。

**Constraint Guardian 保留意见：** 每个 SKILL.md 目标 <400 词；细节进 `references/`。

**User Advocate 保留意见：** 新手读 tutorial；agent 读 skill；operator 读 runbook — 三者交叉链接，不重复正文。
