# SuperCollider Pilot / Primitive Lab Final Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this roadmap phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the highest-feasibility, highest-control, quality-first development path for `supercollider-pilot`, so it becomes a reliable SuperCollider execution core plus a long-running Primitive Lab infrastructure for Zhou Yi and future projects.

**Architecture:** Keep `Pilot` thin and strong as the execution/runtime layer, then add a narrow harness layer, a Primitive Lab layer, an append-only archive/memory layer, an evaluation layer, and only later a small manager-style multi-agent orchestration layer. Do not assume artistic parameters or primitives converge early; design the system so they can emerge and evolve over long-term use without losing control.

**Tech Stack:** TypeScript/Node.js 22+, SuperCollider (`sclang`, `scsynth`, optional `supernova` later), MCP, CLI, structured JSON contracts, local filesystem archive, optional hooks/guardrails, targeted tests, future NRT rendering.

> Status update 2026-06-13:
> the roadmap baseline through `Agent Harness & Narrow Roles` is implemented.
> The active execution package is now `Phase 7 Broad Quality Expansion`, with
> explicit draft-vs-NRT quality separation and minimal primitive bootstrap assets.

---

## 0. 为什么这是最终推荐路线

这份路线图不是从“理想音乐系统长什么样”倒推出来的，而是从以下四个现实同时出发：

1. 这个 repo 当前已经有一个可用的 `Pilot` 核心，不应该推倒重来。
2. 周易项目的 `primitive / parameter / 声音语言` 不会很快定型，必须允许长期演化。
3. 真正影响长期成败的，不只是声音设计本身，而是 agent 是否会长期正确地调用 `Pilot`。
4. 业界成熟 agent 实践说明：可靠性主要来自 `harness + trace + eval + approvals + memory layering`，不来自更长的 prompt。

所以最终路线必须同时解决两层问题：

- **第一层**：`Pilot / MCP / CLI / harness` 本身够不够好
- **第二层**：流程、skills、memory、tool boundary 能不能确保 agent 长期正确使用它

而不是误把“尽快锁定 sound primitives”当成 phase 1 的目标。

## 1. 不可动摇的约束

这些约束在整个路线图中都不应被破坏。

### 1.1 产品与系统边界

- `Pilot` 是主控制面，不是 DAW 替代品，不是音频工作站，不是 live coding 平台总成。
- 当前核心目标是 `text-to-audio` 与 `quality-first render/control loop`。
- 当前不做：
  - DAW 工程导出
  - VST 托管
  - 商业母带链
  - 大规模并行音乐生成
  - 实时录音 / 现场交互响应

### 1.2 工程约束

- 本地优先
- 轻量优先
- 清晰边界优先
- 可恢复优先
- 结构化结果优先
- 不接受“靠 raw logs 猜状态”

### 1.3 艺术系统约束

- 不假设 primitives / parameters 会早期收敛
- 不假设艺术判断可快速形式化
- 不把 memory 简化成“参数表”
- 不把 prompt planner 误解成“快速决定艺术语言”的工具

### 1.4 代码卫生约束

- 目标：单文件 `300-600 LOC`
- 超过 `800 LOC` 必须评估拆分
- `2000+ LOC` 单文件原则上避免
- 任何新模块都必须有单一清晰责任

## 2. 最终目标架构

```mermaid
flowchart LR
    A["User / Curator"] --> B["Planner / Manager"]
    B --> C["Pilot Harness"]
    C --> D["Pilot MCP / CLI"]
    D --> E["sclang"]
    E --> F["scsynth / later supernova"]
    F --> G["Render Artifact"]
    G --> H["Critic / Evaluator"]
    H --> I["Append-only Archive"]
    I --> J["Project Memory Summary"]
    J --> B
```

这个结构里有六个清晰层级：

1. **Pilot core**  
   负责执行、状态、日志、recovery、render

2. **Harness / governance**  
   负责 tool discipline、artifact contract、hook/approval/guardrail

3. **Primitive Lab**  
   负责 probe、candidate、review、evolution，不负责“最终美学真理”

4. **Archive / memory**  
   负责保存演化轨迹，而不是只保存最后结果

5. **Evaluation layer**  
   负责判断任务是否走了正确路径，artifact 是否合格，哪种流程真的有效

6. **Manager-style orchestration**  
   后期再加，只保留窄角色，不做大规模 agent mesh

## 3. 明确不做的路线

以下路径现在都不应成为主线。

### 3.1 不做“大而全音乐平台”

不把 `Pilot` 演化成：

- 音乐语言大全
- 插件宿主
- DAW bridge center
- 实时表演系统

### 3.2 不做“大 memory 先行”

不先构造复杂 shared-memory graph，再去找实际用途。

### 3.3 不做“大规模 multi-agent fan-out”

不先做很多 specialist agent，然后希望系统自己收敛。

### 3.4 不做“先定义最终艺术 ontology”

周易项目不适合在这个阶段先锁死最终声音 ontology。

## 4. 核心开发思路

最终推荐思路不是：

```text
先定义最终声音语言
-> 再做系统
```

而是：

```text
先把 Pilot + Harness 做成长期实验基础设施
-> 再让 Primitive Library 在长期实践中生长
-> 再把反复稳定出现的模式慢慢提升为项目语言
```

因此 phase 1 的关键目标不是“定义声音”，而是：

```text
定义一个能长期正确地生成、比较、存档、筛选、晋升声音试验结果的系统
```

## 5. 代码结构总图

在现有 repo 基础上，推荐演化成下面的结构。

### 现有核心（保留并强化）

- `src/runtime/driver.ts`
- `src/runtime/driver-types.ts`
- `src/runtime/protocol.ts`
- `src/runtime/sclang.ts`
- `src/runtime/sc-file.ts`
- `src/mcp/server.ts`
- `src/cli.ts`

### 新增推荐模块

- `src/harness/`
  - `policies.ts`
  - `task-tags.ts`
  - `artifact-contract.ts`
  - `completion-rules.ts`

- `src/lab/`
  - `probe-spec.ts`
  - `probe-runner.ts`
  - `candidate-registry.ts`
  - `candidate-review.ts`

- `src/archive/`
  - `archive-types.ts`
  - `archive-store.ts`
  - `session-summary.ts`
  - `memory-summary.ts`

- `src/evals/`
  - `path-compliance.ts`
  - `render-quality.ts`
  - `task-outcome.ts`
  - `trace-grading.ts`

- `src/planner/`
  - `sc-spec-schema.ts`
  - `workflow-selector.ts`
  - `prompt-templates.ts`

- `docs/design/`
  - 研究、spec、评估与架构说明

- `docs/superpowers/plans/`
  - 具体实施计划

### 不建议新增的大块模块

- `src/daw/`
- `src/vst/`
- `src/live/`
- `src/multiagent/mesh/`

这些都不应在当前路线里优先出现。

## 6. 总路线图：7 个阶段

下面这 7 个阶段按推荐顺序排列。它们不是全部平均重要，而是有非常明确的先后依赖关系。

| Phase | 名称 | 核心目标 | 是否必须先完成 |
|---|---|---|---|
| 0 | Boundary Freeze | 把边界锁死，防止 scope 漂移 | 是 |
| 1 | Pilot Hardening | 把 `Pilot` 做成真正可靠的执行核心 | 是 |
| 2 | Route Enforcement | 确保 agent 真正走 `Pilot` 路线 | 是 |
| 3 | Primitive Lab | 建立长期 probe / candidate / archive 机制 | 是 |
| 4 | Eval & Memory | 让 traces、artifact、memory summary 可反哺系统 | 是 |
| 5 | Planner & Prompts | 建立受约束的 planning / workflow selection | 否，但强烈建议 |
| 6 | Narrow Multi-Agent | 加入窄角色 orchestration | 否 |
| 7 | Final Quality Expansion | NRT、精选 plugins、后期高级能力 | 否 |

## 7. Phase 0：Boundary Freeze

### 目标

在任何大改之前，把系统边界锁定，防止后续实现过程中不断膨胀。

### 交付物

- 一个明确的边界说明文档
- 一个明确的“不做什么”清单
- 一个模块责任图

### 关键决定

- `Pilot` 只做 SuperCollider driver，不做音乐平台
- 当前阶段不做 DAW / VST / live layer
- 当前阶段不以“收敛艺术参数”为目标

### 退出条件

- 团队内部对以下三件事没有歧义：
  - `Pilot` 是什么
  - 当前 phase 不是什么
  - 后续评估成功靠什么，不靠什么

## 8. Phase 1：Pilot Hardening

### 目标

把现有 `Pilot` 从“可用 driver”提升到“长期基础设施”。

### 首轮建议写入范围

首轮 hardening 不要一下子改满整个 transport + runtime 栈，应该先收窄到核心 runtime 合同层。

#### Primary

- Modify: `src/runtime/driver.ts`
- Modify: `src/runtime/driver-types.ts`
- Modify: `src/runtime/protocol.ts`
- Modify: `tests/runtime/driver.test.ts`
- Modify: `tests/runtime/protocol.test.ts`
- Modify: `tests/live-smoke.test.ts`（仅当真实行为合同改变时）

#### Secondary（只有在首轮 hardening 真的改到外部合同的时候才动）

- Modify: `src/mcp/server.ts`
- Modify: `src/cli.ts`
- Modify: `tests/mcp/server.test.ts`
- Modify: `tests/cli.test.ts`

#### 首轮明确避免

- 不做 `src/runtime/sclang.ts` 的深度重写，除非要重新划分 boot/readiness 责任
- 不优先动 `src/runtime/discover.ts`
- 不优先动 `src/runtime/sc-file.ts`
- 不在这一轮引入 route-enforcement harness 文件
- `src/runtime/render-nrt.ts` 不作为首轮硬依赖，只在后续 Phase 7/NRT 路线明确后再引入

### 核心工作

- 继续强化结构化状态和错误分类
- 把 render 路径与 execution 路径的合同写清楚
- 为后续 artifact contract 预留字段
- 确保 `Pilot` 仍保持单 session、可恢复、可诊断

### 当前阶段成功标准

- agent 或人类都能稳定判断：
  - engine 是否可用
  - session 是否健康
  - render 是否真的成功
  - recovery 是否确实生效

### 为什么它先于一切

因为后面所有 archive、memory、planner、critic 都建立在“执行层可相信”这个前提上。

## 9. Phase 2：Route Enforcement

### 目标

确保 agent 在被标记为 `SC audio generation` 的任务里，实际走 `Pilot`，而不是口头说自己走了。

### 涉及文件

- Create: `src/harness/policies.ts`
- Create: `src/harness/task-tags.ts`
- Create: `src/harness/artifact-contract.ts`
- Create: `src/harness/completion-rules.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/cli.ts`
- Create: `docs/design/route-enforcement-rules.md`

### 核心工作

- 引入任务标签系统，例如：
  - `sc-audio-generation`
  - `sc-probe`
  - `sc-render-review`
- 为这些标签定义完成条件
- 明确哪些动作没有 artifact 不算完成
- 如果外部运行环境允许，后续再接 hook / approval / pre-tool validation

### 推荐的强约束规则

凡是 `sc-audio-generation` 任务，必须满足：

- 有 `.scd` source
- 有 `Pilot` 执行记录
- 有 render artifact
- 有最简 review note

### 当前阶段成功标准

- 至少能明确区分：
  - 真的走了 `Pilot`
  - 没走 `Pilot` 但口头说走了
  - 只产出代码没有产出声音

## 10. Phase 3：Primitive Lab

### 目标

建立一个长期工作的 Primitive Lab，让候选声音单元在长期实践中成长，而不是试图快速锁死最终语义。

### 涉及文件

- Create: `src/lab/probe-spec.ts`
- Create: `src/lab/probe-runner.ts`
- Create: `src/lab/candidate-registry.ts`
- Create: `src/lab/candidate-review.ts`
- Create: `docs/design/primitive-lab-spec.md`
- Create: `docs/design/candidate-lifecycle.md`

### 核心工作

- 定义 `probe` 的最小格式
- 定义 `candidate` 的生命周期：
  - draft
  - candidate
  - accepted
  - rejected
  - revisit
- 允许 primitive 被：
  - 重命名
  - 拆分
  - 合并
  - 降级
  - 废弃

### 关键原则

Primitive Lab 的目标不是快速决定“哪个声音就是周易”，而是建立：

```text
一个可以长期保留试验、反复比较、逐步提升稳定词汇的系统
```

### 当前阶段成功标准

- 每个 candidate 都能追溯：
  - 来自哪个 probe
  - 有哪些 artifacts
  - 被谁怎样评价过
  - 为什么被保留或淘汰

## 11. Phase 4：Eval & Memory

### 目标

让 archive、trace、trajectory、memory summary 变成真正的系统资产。

### 涉及文件

- Create: `src/archive/archive-types.ts`
- Create: `src/archive/archive-store.ts`
- Create: `src/archive/session-summary.ts`
- Create: `src/archive/memory-summary.ts`
- Create: `src/evals/path-compliance.ts`
- Create: `src/evals/render-quality.ts`
- Create: `src/evals/task-outcome.ts`
- Create: `src/evals/trace-grading.ts`
- Create: `docs/design/eval-rubric.md`

### 核心工作

#### A. Append-only archive

保存：

- probe patch
- render output
- logs
- review note
- candidate lifecycle changes

#### B. Session summary

每轮任务结束后，归纳：

- 做了什么
- 是否真的走了 Pilot
- 什么地方失败
- 哪个结果值得保留

#### C. Memory summary

按长期项目层面归纳：

- 哪类 timbral family 经常有潜力
- 哪类 prompt 容易变空
- 哪类 candidate 经常被淘汰
- 哪类 failure mode 重复出现

### 推荐的初始 eval 指标

- `pilot_path_compliance_rate`
- `render_success_rate`
- `artifact_completion_rate`
- `recovery_invocation_rate`
- `candidate_acceptance_ratio`
- `review_rejection_reason_distribution`

### 当前阶段成功标准

- 不是只“存了很多文件”，而是真的能用 archive 反过来回答：
  - 哪种 workflow 更可靠
  - 哪种 route 最容易 drift
  - 哪类试验最值得继续

## 12. Phase 5：Planner & Prompt Infrastructure

### 目标

建立受约束的 planning / workflow selection 层，但不假装它能替代艺术判断。

### 涉及文件

- Create: `src/planner/sc-spec-schema.ts`
- Create: `src/planner/workflow-selector.ts`
- Create: `src/planner/prompt-templates.ts`
- Create: `docs/design/planner-spec.md`

### 核心工作

- 定义结构化 `SC spec`
- 定义当前任务属于哪种 workflow：
  - probe
  - patch refinement
  - render QA
  - candidate promotion
- 让 planner 先决定 workflow，再决定 tool path

### 应避免的误区

- 不把 planner 误解成“最终美学大脑”
- 不让 planner 直接越过 artifact / review
- 不让 planner 直接替代长期 archive 学习

### 当前阶段成功标准

- planner 至少能减少流程混乱
- 而不是制造另一个会胡思乱想的大 prompt 层

## 13. Phase 6：Narrow Multi-Agent

### 目标

只在前五阶段基础设施稳定后，加入窄角色 orchestration。

### 推荐角色

#### 1. Manager / Planner

- 最终对任务完成负责
- 选择 specialist
- 决定是否进入 review / archive / retry

#### 2. SC Builder

- 只负责 SC 相关生成与执行
- 工具面严格收窄到 `Pilot`

#### 3. Evaluator / Critic

- 只看 artifacts、logs、eval signals
- 不直接主导代码路径

#### 4. Archivist（可选）

- 只在后期加入
- 负责整理长期 summary，而不是做主要创作决策

### 不推荐的结构

- 大量 specialist 平行乱跑
- 深层递归 subagents
- shared memory 先行、角色后补

### 当前阶段成功标准

- 多 agent 带来的收益是：
  - 上下文更干净
  - 分工更稳定
  - review 更可靠
- 而不是 token 更高、系统更乱

## 14. Phase 7：Final Quality Expansion

### 目标

在前面结构都稳定后，才开启高质量扩展。

### 包括什么

- 真正的 NRT render 路径
- 选择性 `sc3-plugins`
- `supernova` 的有意识引入
- 后续更复杂的 corpus / FluCoMa 研究

### 明确不包括什么

当前路线图并不要求现在就接：

- DAW
- VST
- 商业效果器
- 实时 performance routing

### 当前阶段成功标准

- 每个扩展都是因为它能明确提高质量或能力
- 而不是因为它“听起来很高级”

## 15. 三个最重要的长期制度

如果这份路线图只能落地三件事，那应该先落这三件。

### 制度 1：Pilot Route Enforcement

```text
凡是 SC 音频任务，
必须通过 Pilot 路线落地，
没有 Pilot artifact 不算完成
```

### 制度 2：Append-only Creative Archive

```text
所有重要 probe / candidate / review / reject 轨迹必须可回看
```

### 制度 3：Eval-before-expansion

```text
没有评估闭环，
不扩多 agent，不扩 memory，不扩外部能力
```

## 16. 风险与应对

### 风险 1：系统又变成 prompt engineering 项目

**原因**：过度依赖 skills / instructions  
**应对**：把真正约束放回 tool boundary、artifact contract、approval/hook

### 风险 2：系统又变成音乐框架大杂烩

**原因**：边界没锁死  
**应对**：Phase 0 先冻结 scope，不在当前 phase 引入 DAW/VST/live layer

### 风险 3：archive 很多，但没有可用信息

**原因**：只存文件，不做 summary / eval  
**应对**：每轮必须写 session summary；每阶段必须写长期 memory summary

### 风险 4：multi-agent 反而增加漂移

**原因**：角色太多、权限太大  
**应对**：只保留 manager + builder + evaluator 三角色起步

### 风险 5：代码快速长成石山

**原因**：所有逻辑塞进少数大文件  
**应对**：在 phase 早期就锁模块边界与文件大小策略

## 17. 当前最优先的四个实施子计划

这份总路线图批准后，不要直接全线开工。应拆成四个具体实施计划，按顺序推进。

### Plan H：Phase 1 Pilot Hardening

目标：

- 把 `Pilot` runtime 核心做成可长期依赖的执行层

### Plan A：Pilot Route Enforcement

目标：

- 把 `Pilot` 路径强约束与 artifact completion rules 建起来

### Plan B：Primitive Lab + Archive

目标：

- 把 probe、candidate、archive、review lifecycle 建起来

### Plan C：Eval + Planner + Narrow Roles

目标：

- 把 memory summary、eval harness、workflow selector、窄角色 orchestration 建起来

这个拆法的好处是：

- 每个子计划都能单独验证
- 不会一次把 repo 复杂度拉爆
- 也更符合你要求的清晰架构

### 命名说明

- `Phase 1` 是系统阶段名
- `Plan H` 是它的首个执行包
- `Plan A / B / C` 是后续三个执行包

不要把 `Phase 1` 和 `Plan A` 当成同一件事。

## 18. 最终排序：为什么是这个顺序

最终推荐顺序是：

```text
Boundary
-> Pilot hardening (Plan H)
-> Route enforcement
-> Primitive Lab
-> Archive / eval / memory
-> Planner
-> Narrow multi-agent
-> Final quality expansion
```

原因很简单：

1. 没有稳定执行层，就没有可靠 artifacts
2. 没有 route enforcement，就没有可信轨迹
3. 没有 archive / eval，就没有长期学习
4. 没有前面三层，multi-agent 只会扩大混乱
5. 没有这些基础，后面的艺术语言和高质量扩展都缺支撑

## 19. 一句话版本

这条最终路线，不是“先定义一套周易声音参数系统”，而是：

```text
先把 SuperCollider Pilot 做成一个可控、可审计、可积累、
能长期承载艺术试验的 Primitive Lab 基础设施，
再让声音语言在这个基础设施里慢慢长出来。
```

这就是当前阶段**可行性最高、效果最好、最符合你要求**的最终 approach。
