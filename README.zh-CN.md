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
- 所有动作统一返回：`success`、`state`、`phase`、`session_id`、`recoverable`、`error_kind`、`summary`、`raw_output`
- 恢复面：`sc_stop`、`sc_reset`、`sc_reboot`、`sc_reclaim`
- Pilot MCP 工具：`sc_check`、`sc_status`、`sc_health`、`sc_eval`、`sc_run_file`、`sc_logs`、`sc_render`、`sc_stop`、`sc_reset`、`sc_reboot`、`sc_reclaim`
- CLI：`check`、`status`、`health`、`eval`、`run`、`logs`、`render`、`stop`、`reset`、`reboot`、`reclaim`
- 实时草稿渲染链路：boot/record/verify/teardown
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

# 查看当前日志缓冲
node dist/cli.js logs --tail 500

# 录制为 WAV
node dist/cli.js render path/to/script.scd -o /tmp/out.wav -d 5

# 恢复动作
node dist/cli.js reset
node dist/cli.js reboot
node dist/cli.js reclaim

# 可选：全局安装
npm link
scctl check
```

### Pilot 服务（MCP）

stdio 方式启动 Pilot MCP 服务：

```bash
node dist/mcp/server.js
```

**Claude Desktop** — 在 `claude_desktop_config.json` 中添加：

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

| 工具 | 参数 | 说明 |
|------|------|------|
| `sc_check` | — | 验证引擎路径与解释器可达性 |
| `sc_status` | — | 返回当前 driver 会话快照 |
| `sc_health` | — | 探测活动会话健康状态与 server ready 状态 |
| `sc_eval` | `code`（必填） | 在活动会话中执行内联代码 |
| `sc_run_file` | `path`（必填） | 读取并执行 `.scd` 文件 |
| `sc_logs` | `tail`（可选） | 返回当前日志缓冲 |
| `sc_render` | `out`（必填），`path` 或 `code`，`duration` | 产出草稿 WAV，并在结束后关闭会话 |
| `sc_stop` | — | 停止当前会话 |
| `sc_reset` | — | 尽量保留会话，仅清理当前状态 |
| `sc_reboot` | — | 关闭并重建一个 fresh ready 会话 |
| `sc_reclaim` | — | 从 degraded/脏会话中回收并重建本地会话 |

### Agent 工作流

典型设计阶段循环：`sc_check` → `sc_status`/`sc_health` → `sc_eval` 或 `sc_run_file` → `sc_logs`（出错时）→ `sc_render` → `sc_reclaim` 或 `sc_stop`。

- `.scd` 与 WAV 输出请使用**绝对路径**（无默认工作目录）。
- SuperCollider 侧只写 SynthDef、播放与渲染片段；业务逻辑放在项目其他层。
- 该 driver 是**单会话、本地优先**的；恢复请用 `sc_reset`、`sc_reboot`、`sc_reclaim`，不要只靠 post 文本猜状态。
- CLI 输出为结构化 JSON；原始 SuperCollider 输出保存在 `raw_output`。

设计说明：[docs/design/scctl-scope-enhancement.md](docs/design/scctl-scope-enhancement.md)

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

```text
Pilot client / CLI
       │
       ▼
src/mcp/server.ts  or  src/cli.ts
       │
       ▼
ScDriver (src/runtime/driver.ts)
       │  结构化状态 + 恢复语义 + 协议辅助函数
       ▼
SclangController (src/runtime/sclang.ts)
       │  原始脚本执行 + completion marker
       ▼
sclang → scsynth → audio output
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
