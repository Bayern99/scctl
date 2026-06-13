# Consumer 项目快速接入

把 SuperCollider Pilot（`scctl`）接到**你的项目**工作区：拉哪些文件、MCP 怎么配、新开项目重复哪几步。机制说明见 [governed-pilot-tutorial.zh-CN.md](./governed-pilot-tutorial.zh-CN.md)。

Pilot 仓库路径下文记为 `PILOT_ROOT`（本仓库 clone 并 `npm run build` 后的根目录）。

---

## Agent 执行清单（按顺序）

在 **consumer 项目根**执行，不要在本仓库（supercollider-pilot）根目录冒充 consumer。

1. **确认 Pilot 可用**  
   `node "$PILOT_ROOT/dist/cli.js" check` → JSON 中 `success: true`

2. **一次性写入 consumer 工作区**  
   `"$PILOT_ROOT/scripts/bootstrap-consumer-project.sh" "/absolute/path/to/consumer-project"`

3. **配置 MCP**（Cursor / Claude Desktop，工作区 = consumer 项目）  
   - `command`: `node`  
   - `args`: `["$PILOT_ROOT/dist/mcp/server.js"]`（必须绝对路径）  
   - `env`（governed 任务）：`SCCTL_GOVERNED_ROLE`: `builder`（或 `manager` / `critic`）

4. **改项目 KB**  
   编辑 consumer 内 `docs/superpowers/kb/project-rules.md` 等，写本项目规则（非 Pilot 源码规则）。

5. **验证 governed 路径**  
   在 consumer 工作区让 Agent 调用 `sc_prepare_handoff` → 检查 consumer 根下出现 `.scctl/governed-role` 与 `kb_snapshot` 非空。

6. **创作任务**  
   Agent 走 MCP：`sc_prepare_handoff` → `sc_run_probe` → … → `sc_audit_session`。`.scd` / WAV 用绝对路径。

operator/debug（通路测试）可跳过 handoff，直接 `sc_check` / `sc_eval`；不设 `SCCTL_GOVERNED_ROLE` 时不硬拦 raw 工具。

---

## 从 Pilot 仓库拉什么

bootstrap 脚本会从 `PILOT_ROOT` 复制到 consumer：

| 源（Pilot 仓库） | 目标（consumer 项目） | 用途 |
|------------------|----------------------|------|
| `docs/superpowers/kb/*` | 同路径 | handoff → `kb_snapshot` |
| `docs/superpowers/roles/*` | 同路径 | 窄角色说明（Agent / skill 引用） |
| `.agents/skills/scctl-*` | 同路径 | Agent 操作流程 |
| `hooks/scctl-*.js` + `hooks/hooks.json` | `hooks/` | 可选 MCP 预检 |
| （生成） | `.cursor/hooks.json` | Cursor 读 hooks |
| （生成） | `.scctl-pilot.env.example` | MCP env 备忘 |
| （追加） | `.gitignore` 中 `.scctl/` | 运行时状态不入库 |

**不复制**：Pilot 源码、`dist/`（MCP 仍指向 `PILOT_ROOT/dist/mcp/server.js`）、`sc/families/`（consumer 自备 `.scd` 资产）。

---

## 一次性 bootstrap（推荐）

```bash
export PILOT_ROOT="/absolute/path/to/supercollider-pilot"
cd "$PILOT_ROOT" && npm install && npm run build

"$PILOT_ROOT/scripts/bootstrap-consumer-project.sh" "/absolute/path/to/your-music-project"
```

完成后 consumer 目录大致为：

```text
your-music-project/
  docs/superpowers/kb/          # 已复制，需按项目改
  docs/superpowers/roles/
  .agents/skills/scctl-*/
  hooks/scctl-*.js
  .cursor/hooks.json
  .scctl-pilot.env.example
  .scctl/                       # 首次 handoff 后生成，已 gitignore
```

---

## MCP 配置示例

**Cursor** — 项目或用户 `mcp.json`（打开的工作区必须是 consumer 项目）：

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

- `cwd` 由 IDE 设为当前 workspace → archive / KB / marker 都落在 **consumer 根**。  
- Pilot 二进制不在 consumer 里；只复制治理资产。  
- Agent **用 MCP 工具**，不要用 shell 调 `scctl` 做 governed loop（CLI 无 MCP preflight，且每次新进程）。

---

## 每个新项目要做的事

| 步骤 | 动作 |
|------|------|
| 1 | clone / 打开新 consumer 仓库 |
| 2 | 再跑一遍 `bootstrap-consumer-project.sh <新项目路径>` |
| 3 | 确认 MCP 仍指向同一 `PILOT_ROOT`（或新版本 build 路径） |
| 4 | 改新项目 `docs/superpowers/kb/`（规则、primitive、失败模式） |
| 5 | 添加本项目 `.scd` / 声音资产目录 |
| 6 | `sc_check` + 一次 `sc_prepare_handoff` 冒烟 |

不必重装 SuperCollider；不必复制 Pilot 源码。每个 consumer 各有一份 KB、archive、skills。

---

## 手工 bootstrap（无脚本时）

```bash
CONSUMER="/absolute/path/to/your-project"
PILOT="/absolute/path/to/supercollider-pilot"

mkdir -p "$CONSUMER/docs/superpowers/kb" "$CONSUMER/docs/superpowers/roles"
mkdir -p "$CONSUMER/.agents/skills" "$CONSUMER/hooks"

cp -R "$PILOT/docs/superpowers/kb/." "$CONSUMER/docs/superpowers/kb/"
cp -R "$PILOT/docs/superpowers/roles/." "$CONSUMER/docs/superpowers/roles/"
cp -R "$PILOT/.agents/skills/." "$CONSUMER/.agents/skills/"
cp "$PILOT/hooks/scctl-"*.js "$CONSUMER/hooks/"
# 再写入 .cursor/hooks.json（见脚本内容）并 gitignore .scctl/
```

---

## 验证

在 **consumer 工作区**：

```bash
node "$PILOT_ROOT/dist/cli.js" check
node "$PILOT_ROOT/dist/cli.js" health
```

Agent 经 MCP：

1. `sc_prepare_handoff`（`task_tag`: `sc-probe`）  
2. 确认返回 `kb_snapshot` 含 `project_rules` 等条目  
3. 确认 consumer 根目录存在 `.scctl/governed-role`

失败时见 [smoke-troubleshooting.md](../smoke-troubleshooting.md) 与教程「故障」节。

---

## 参考

- [governed-pilot-tutorial.zh-CN.md](./governed-pilot-tutorial.zh-CN.md) — 使用流、Prompt、MCP 工具表  
- [operator-runbook.zh-CN.md](../operator-runbook.zh-CN.md) — CLI、环境变量  
- [agent-skills-spec.zh-CN.md](./agent-skills-spec.zh-CN.md) — skills 维护  
- [README.zh-CN.md](../../README.zh-CN.md) — 总览
