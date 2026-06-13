# AGENTS.md — supercollider-pilot

> 本文件是给 AI coding agent 的项目说明书。
> 如果你要修改代码，先读这里。更深层的架构/路线图上下文见 `docs/design/` 和 `docs/superpowers/plans/`。

---

## 1. 项目定位

`supercollider-pilot`（包名 `scctl`）是 SuperCollider 的 Agent 控制适配层：

```text
Agent → MCP / CLI → ScDriver → sclang → scsynth → audio output
```

- 不是 DAW、不是 VST 宿主、不是 live-coding 平台。
- 当前目标是 `text-to-audio` 与 `quality-first render/control loop`。
- 声音语言（primitive / parameter）不假设早期收敛，系统设计要支持长期演化。

---

## 2. 开发环境

- Node.js >= 22
- 可选：本地安装 SuperCollider（`sclang` / `scsynth`），用于 live smoke 测试。
- 使用 npm（当前仓库没有 pnpm workspace）。

常用命令：

```bash
npm install
npm run typecheck    # tsc --noEmit
npm run build        # 输出到 dist/
npm test             # vitest run
npm run test:live    # 需要本地 sclang；运行 tests/live-smoke.test.ts
npm run test:watch   # vitest watch 模式
```

编译产物：

- `dist/cli.js` — CLI 入口
- `dist/mcp/server.js` — MCP stdio server 入口

---

## 3. 模块边界（不要打穿）

| 层级 | 文件 | 职责 | 不要做什么 |
|------|------|------|------------|
| Runtime core | `src/runtime/driver.ts`, `sclang.ts`, `protocol.ts`, `driver-types.ts` | sclang 进程控制、状态机、脚本协议 | 不要把 lab/archive/eval/planner 逻辑塞进来 |
| Transport | `src/cli.ts`, `src/mcp/server.ts` | 参数入口、调用 runtime、返回 JSON | 不要在这里加业务编排 |
| Harness | `src/harness/*` | 任务标签、artifact contract、完成规则 | 不要依赖 prompt 做约束 |
| Workflow | `src/workflow/service.ts` | plan / probe / summarize / candidate / memory 编排 | 不要直接 spawn sclang |
| Lab | `src/lab/*` | probe、candidate 生命周期、review | 不要越过 driver 直接调 SclangController |
| Archive | `src/archive/*` | append-only JSONL archive、session/memory summary | 不要改成复杂数据库 |
| Evals | `src/evals/*` | path compliance、render quality、task outcome、trace grading | 不要变成主观审美裁决 |
| Planner | `src/planner/*` | SC spec schema、workflow selector、prompt templates | 不要替代艺术判断 |
| Orchestration | `src/orchestration/*` | handoff packets、shared KB snapshot、session audit | 不要直接执行 SuperCollider |

---

## 4. 代码规范

- TypeScript 5.x、`strict`、ES2022、`NodeNext` 模块解析。
- 单文件目标：**300–600 LOC**。
- 超过 **800 LOC** 必须考虑拆分。
- **2000+ LOC** 单文件原则上禁止。
- 新增模块必须有单一清晰责任，并配套测试文件。
- 优先使用 Vitest globals：`describe` / `it` / `expect` 无需导入。

---

## 5. 测试要求

任何代码改动必须通过：

```bash
npm run typecheck
npm run build
npm test
```

如果本地有 SuperCollider：

```bash
npm run test:live
```

按改动位置补充测试：

- `src/runtime/*` → `tests/runtime/*.test.ts`
- `src/cli.ts` → `tests/cli.test.ts`
- `src/mcp/server.ts` → `tests/mcp/server.test.ts`
- `src/workflow/*` → `tests/workflow/*.test.ts`
- `src/lab/*` → `tests/lab/*.test.ts`
- `src/archive/*` → `tests/archive/*.test.ts`
- `src/harness/*` → `tests/harness/*.test.ts`
- `src/evals/*` / `src/planner/*` → 对应 `tests/evals/` / `tests/planner/`

Live smoke 测试在 `tests/live-smoke.test.ts`，仅在 `SCCTL_RUN_LIVE_SMOKE=1` 且能发现 `sclang` 时运行。

---

## 6. 当前路线图：按顺序执行

不要跳阶段。当前基线已经完成到 `Workflow Surface` 与 `Agent Harness & Narrow Roles`，当前执行包已经进入 `Phase 7 Broad Quality Expansion`：

```text
Plan H: Pilot Hardening
  → Plan A: Route Enforcement
  → Plan B: Primitive Lab + Archive
  → Plan C: Eval + Planner + Narrow Roles
  → Agent Harness & Narrow Roles
  → Phase 7A: NRT Core + Capability Registry
  → Phase 7B: Quality Eval + Governed Final Render
  → Phase 7C: Primitive Bootstrap + Real Artifact Growth
  → Phase 7.1: Governance Hardening (opt-in RBAC + hooks)
  → Phase 7.2: Project Agent Skills + session context
```

| 计划 | 当前优先级 | 主要文件 |
|------|------------|----------|
| **Plan H / A / B / C** | 已有绿色基线 | `src/runtime/*`, `src/harness/*`, `src/lab/*`, `src/archive/*`, `src/evals/*`, `src/planner/*`, `src/workflow/service.ts` |
| **Agent Harness & Narrow Roles** | 已完成首轮收口 | `src/orchestration/*`, `docs/superpowers/kb/*`, `docs/superpowers/roles/*`, CLI/MCP governance tools |
| **Phase 7 Broad Quality Expansion** | 已完成主体 | `src/runtime/*`, `src/evals/*`, `src/workflow/*`, `src/orchestration/*`, `sc/*`, docs/KB/roles |
| **Phase 7.1 Governance Hardening** | 已完成 | `src/harness/role-policies.ts`, `src/transport/governance.ts`, `hooks/*`, `.cursor/hooks.json` |
| **Phase 7.2 Agent Skills & Context** | 现在 | `.agents/skills/scctl-*`, `docs/guides/agent-skills-spec.zh-CN.md`, `hooks/scctl-session-start.js`, `scripts/harness-audit.js` (skills scope) |

关键约束：

- raw `sc_eval / sc_run_file / sc_render` 保持为 operator/debug surface（默认不阻断）。
- 设置 `SCCTL_GOVERNED_ROLE` 时，MCP/CLI 按 [`role-tool-policies.json`](docs/superpowers/kb/role-tool-policies.json) 阻断 forbidden raw tools。
- `prepare_handoff` 成功后会写入 `.scctl/governed-role`，供 Cursor hooks 与 preflight 脚本感知 governed session。
- raw `sc_render_nrt` 是 final-quality runtime surface，但仍不替代 governed workflow。
- 受治理的创作 loop 默认走 orchestration + workflow tools。
- 不把 orchestration 逻辑回流到 runtime。
- 项目 Agent skills 在 `.agents/skills/scctl-*`（agent 中立路径，不绑单一 IDE）；写作规范见 [`docs/guides/agent-skills-spec.zh-CN.md`](docs/guides/agent-skills-spec.zh-CN.md)。**Consumer 接入清单：** [`docs/guides/consumer-bootstrap.zh-CN.md`](docs/guides/consumer-bootstrap.zh-CN.md)。使用教程见 [`docs/guides/governed-pilot-tutorial.zh-CN.md`](docs/guides/governed-pilot-tutorial.zh-CN.md)（不改 README）。

---

## 7. 系统边界：现在不做

不要引入：

- DAW 导出
- VST 托管 / 商业效果器
- 实时 performance routing
- 大规模并行生成
- 先行的 shared-memory graph / 大型 multi-agent mesh
- 把 `supernova` 默认化（后续按需引入）
- 把 memory 当成“参数数据库”

---

## 8. 关键制度

1. **Pilot Route Enforcement**：SC 音频任务必须经 Pilot 落地；没有 Pilot artifact 不算完成。
2. **Append-only Archive**：probe / candidate / review / reject 轨迹必须可回看。
3. **Eval-before-expansion**：没有评估闭环，不扩 multi-agent / memory / 外部能力。
4. **Governed Loop First**：`prepare_handoff -> run_probe -> summarize_session -> add_review / candidate_action -> audit_session -> memory_summary` 是默认治理路径。
5. **Draft vs Final Split**：`sc_render` 是 draft path；`sc_render_nrt` 是 final-quality path。声明 `final_nrt` 的任务不能用 draft artifact 闭环。

---

## 9. 提交前检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] 改动涉及 runtime/CLI/MCP/workflow/lab/archive/evals/planner 时，已补对应测试
- [ ] 新增文件大小控制在 300–600 LOC；超过 800 已评估拆分
- [ ] 没有打穿模块边界
- [ ] 如果修改了架构、模块地图、CLI/MCP 工具或路线图，已同步更新 `AGENTS.md`

---

## 10. 参考文档

| 文档 | 用途 |
|------|------|
| `docs/operator-runbook.md` / [`operator-runbook.zh-CN.md`](docs/operator-runbook.zh-CN.md) | operator/debug vs governed 操作手册 |
| `README.md` / `README.zh-CN.md` | 人类 quick start |
| `docs/design/boundary-freeze.md` | 当前基础设施 phase 的边界冻结 |
| `docs/design/scctl-scope-enhancement.md` | 已批准的 R1 render spec |
| `docs/design/control-approach-notes.md` | 为什么先做薄控制层 |
| `docs/design/route-enforcement-rules.md` | Pilot route enforcement 与 task policy |
| `docs/design/primitive-lab-spec.md` | probe / candidate 实验闭环说明 |
| `docs/design/candidate-lifecycle.md` | candidate 状态与 review gate |
| `docs/design/eval-rubric.md` | eval 指标与解释边界 |
| `docs/design/planner-spec.md` | planner 输入输出与非目标 |
| `docs/design/zhouyi-supercollider-agent-assessment.zh-CN.md` | 周易项目评估与推荐架构（consumer 参考，非本仓库 runtime） |
| `docs/design/agent-harness-research-2026-06-13.zh-CN.md` | harness / memory / multi-agent 研究 |
| `docs/design/README.md` | 设计文档索引与 merge 分类 |
| `docs/MERGE-READINESS.md` | 合并 main 前检查清单 |
| `docs/guides/agent-skills-spec.zh-CN.md` | 项目 Agent skill 分层与 TDD 写作规范 |
| `docs/guides/governed-pilot-tutorial.zh-CN.md` | 人类新手 governed pilot 教程 |
| `docs/superpowers/plans/2026-06-13-supercollider-pilot-final-roadmap.md` | 7 阶段最终路线图 |
| `docs/superpowers/plans/2026-06-13-supercollider-pilot-execution-plan.zh-CN.md` | 可执行子代理计划 |
| `docs/superpowers/status.md` | 当前治理基线与 operator/debug vs governed surface 说明 |
| `docs/smoke-troubleshooting.md` | smoke 测试与故障排查 |
