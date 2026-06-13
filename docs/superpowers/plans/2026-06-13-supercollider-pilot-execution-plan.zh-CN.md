# SuperCollider Pilot 可执行实施计划（Subagent-Driven）

Date: 2026-06-13  
Repo: `supercollider-pilot`  
Language: 中文  
Status: updated-after-phase-7a-7c — **progress source of truth:** `docs/superpowers/status.md`

> Update 2026-06-13:
> `Plan H / A / B / C`、`Workflow Surface`、`Agent Harness & Narrow Roles`
> 已经进入绿色基线。当前执行包不再是“先做治理骨架”，而是
> `Phase 7 Broad Quality Expansion`：
> `NRT Core + Capability Registry -> Quality Eval + Governed Final Render -> Primitive Bootstrap + Real Artifact Growth`。

## 1. 这份文档的作用

这不是新的总路线图，而是把现有结论真正拆成可执行计划。

它建立在三份上游文档之上：

- `docs/design/zhouyi-supercollider-agent-assessment.zh-CN.md`
- `docs/design/agent-harness-research-2026-06-13.zh-CN.md`
- `docs/superpowers/plans/2026-06-13-supercollider-pilot-final-roadmap.md`

这里要解决的问题不是“再多写一点理念”，而是：

```text
接下来到底先改什么
哪些文件该动
哪些文件现在不要动
怎么验证
怎么用 subagent 而不把系统做乱
```

## 2. 总体判断

结论很明确：

1. 这条路线是可实现的。
2. 但实现前提不是“堆更多音乐功能”，而是把 `Pilot -> Harness -> Lab -> Archive/Eval -> Planner -> Narrow Roles` 这条层次做清楚。
3. `runtime` 已经具备可保留的核心形状，后续不应让 `Primitive Lab / Archive / Eval / Planner` 反向污染它。
4. multi-agent 不是第一阶段主角。第一阶段真正的主角是：
   - 稳定执行合同
   - 工具路径约束
   - artifact completion
   - append-only archive
   - session / memory summary

## 3. 先锁死的实现约束

### 3.1 现在不做

- 不做 DAW 导出
- 不做 VST 托管
- 不做商业母带链
- 不做实时 performance routing
- 不做大规模并行生成
- 不做 shared KB 先行的大型 multi-agent mesh

### 3.2 现在必须坚持

- `Pilot` 继续保持本地、轻量、单 session、结构化结果
- route enforcement 先从 MCP / CLI 边界做起
- archive 先做 append-only，不做复杂数据库
- memory 先做 summary，不做“大而全语义图谱”
- multi-agent 先做窄角色，不做深层递归委派

## 4. 现有代码边界判断

根据仓库结构和子代理勘察，当前最重要的边界是：

### 4.1 应保留为核心 runtime 的部分

- `src/runtime/driver.ts`
- `src/runtime/driver-types.ts`
- `src/runtime/protocol.ts`
- `src/runtime/sclang.ts`
- `src/runtime/discover.ts`
- `src/runtime/sc-file.ts`

这层只负责：

- `sclang` 发现与进程控制
- SC protocol script 构造
- session lifecycle / recovery
- render / eval / run 的结构化结果

### 4.2 应保持为薄 transport 的部分

- `src/mcp/server.ts`
- `src/cli.ts`

这层只负责：

- 参数入口
- 调用 runtime
- 返回结构化结果

### 4.3 应以后加在外层的新模块

- `src/harness/`
- `src/lab/`
- `src/archive/`
- `src/evals/`
- `src/planner/`

不要把这些责任塞回 `driver.ts`。

## 5. 执行顺序

真正推荐的执行顺序是：

```text
Plan H: Pilot Hardening
-> Plan A: Route Enforcement
-> Plan B: Primitive Lab + Archive
-> Plan C: Eval + Planner + Narrow Roles
```

原因很简单：

1. 没有稳定 driver，后面的 artifact 都不可信
2. 没有 route enforcement，就无法证明 agent 真在走 Pilot
3. 没有 archive / eval，长期 artistic evolution 只有口头描述，没有系统资产
4. 没有前面三层，multi-agent 只会放大漂移

## 6. Plan H：Pilot Hardening

### 6.1 目标

把当前 `Pilot` 从“可用”变成“长期基础设施”，但不在这一阶段把 repo 复杂度直接拉爆。

### 6.2 首轮写入范围

#### Primary

- `src/runtime/driver.ts`
- `src/runtime/driver-types.ts`
- `src/runtime/protocol.ts`
- `tests/runtime/driver.test.ts`
- `tests/runtime/protocol.test.ts`
- `tests/live-smoke.test.ts`（仅当真实行为合同改变时）

#### Secondary（只在外部合同真的受影响时才动）

- `src/mcp/server.ts`
- `src/cli.ts`
- `tests/mcp/server.test.ts`
- `tests/cli.test.ts`

### 6.3 首轮明确不要碰

- 不深改 `src/runtime/sclang.ts` 的 boot/readiness 分工
- 不提前引入 `src/harness/*`
- 不提前引入 `src/lab/*`
- 不把 NRT 路径塞进这一轮核心 hardening

### 6.4 任务拆分

- [x] H1. 审核并收紧 `DriverResult` / `RenderArtifact` 的长期合同
- [x] H2. 把 render 成功 / 失败的结构化判定再做明确化
- [x] H3. 校对 `ensureReadyController()`、recovery、degraded 状态转移的可诊断性
- [x] H4. 用测试把这些合同钉死
- [x] H5. 只有在外部 JSON 合同变化时，才同步 CLI / MCP

### 6.5 退出条件

- `engine_missing / idle / ready / busy / degraded / stopped` 等状态在测试里有明确含义
- render 成功不再只是“看起来像成功”，而是有稳定结构判断
- recovery 是否生效可以从结果里稳定判断
- `npm run typecheck`
- `npm run test`
- `npm run test:live`（在本地 SC 可用时）

### 6.6 子代理使用方式

- explorer：继续只做 runtime 结构问题勘察
- worker：如果进入实现，只给它 `src/runtime/*` + 对应 `tests/runtime/*` 的明确写入所有权
- manager：本线程保留最终合同判断，不把 driver contract 全部外包

## 7. Plan A：Pilot Route Enforcement

### 7.1 目标

解决你最在意的那个问题：

```text
怎么确保 agent 真正调用 Pilot，
而不是最后又回到 Python / 旁路生成 / 口头宣称完成
```

### 7.2 首轮写入范围

- Create: `src/harness/task-tags.ts`
- Create: `src/harness/artifact-contract.ts`
- Create: `src/harness/completion-rules.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/cli.ts`
- Modify: `src/runtime/driver-types.ts`（只加可选字段）
- Modify: `tests/mcp/server.test.ts`
- Modify: `tests/cli.test.ts`
- Modify: `tests/runtime/driver.test.ts`（仅当合同字段变化触达 runtime 结果）

### 7.3 首轮设计原则

#### 只加可选合同，不破坏现有调用

- `task_tag` 一开始不要做成全局必填
- 先只在 `run` / `render` 上支持
- `DriverResult` 只追加可选 `compliance` 字段

#### 把约束放在入口边界

- 先在 MCP / CLI 入口加 `task_tag`
- 先在 transport 边界做 completion evaluation
- 不先动 `protocol.ts`
- 不先动 `sclang.ts`
- 不先改 `ScDriver` 方法签名

### 7.4 首轮任务拆分

- [x] A1. 定义任务标签：`sc-audio-generation`、`sc-probe`、`sc-render-review`
- [x] A2. 定义 `requiresRenderArtifact()` 等纯函数合同
- [x] A3. 定义 `evaluateCompletion()`：输入任务标签、入口动作、`DriverResult`
- [x] A4. 在 MCP `sc_run_file` / `sc_render` 上增加可选 `task_tag`
- [x] A5. 在 CLI `run` / `render` 上增加可选 `--task-tag`
- [x] A6. 在 JSON 结果中附加非破坏性 `compliance` 块
- [x] A7. 写测试证明“真的走了 Pilot”和“只有代码没有 artifact”可以被区分

### 7.5 退出条件

- 至少能够区分三种情况：
  - 真的走了 `Pilot`
  - 只跑了代码，没有产出 artifact
  - 没走 `Pilot` 却试图宣称完成
- 现有 MCP / CLI 客户端不因为这轮改动被硬性打断

## 8. Plan B：Primitive Lab + Archive

### 8.1 目标

不要再假设周易项目的 primitive 会快速收敛。系统应该支持长期生成、比较、保留、淘汰、回看。

### 8.2 首轮写入范围

- Create: `src/lab/lab-types.ts`
- Create: `src/lab/probe-spec.ts`
- Create: `src/lab/probe-runner.ts`
- Create: `src/lab/candidate-registry.ts`
- Create: `src/lab/candidate-review.ts`
- Create: `src/archive/archive-types.ts`
- Create: `src/archive/archive-store.ts`
- Create: `src/archive/session-summary.ts`
- Create: `tests/lab/*`
- Create: `tests/archive/*`
- Create: `docs/design/primitive-lab-spec.md`
- Create: `docs/design/candidate-lifecycle.md`

### 8.3 首轮不要做

- 不做复杂数据库
- 不做自动美学裁决
- 不做大规模 embedding / clustering
- 不做 FluCoMa 驱动的长期语义自动学习

### 8.4 首轮任务拆分

- [x] B1. 定义 `ProbeSpec` 和最小 probe 输入格式
- [x] B2. 定义 candidate 生命周期：`draft -> candidate -> accepted/rejected/revisit`
- [x] B3. 定义 candidate 元操作：rename / split / merge / deprecate
- [x] B4. 让 `probe-runner` 通过 `ScDriver` 执行，而不是直接越过到 `SclangController`
- [x] B5. 实现 append-only archive-store
- [x] B6. 为每次 probe / render / review 写 session summary
- [x] B7. 把最小 review note 接到 candidate 生命周期

### 8.5 退出条件

- 每个 candidate 都能回答四个问题：
  - 它从哪个 probe 来
  - 它有哪些 artifact
  - 它被怎样评价过
  - 它为什么被保留、淘汰或回炉

## 9. Plan C：Eval + Planner + Narrow Roles

### 9.1 目标

把 archive 变成系统资产，再把 multi-agent 收窄为真正有用的角色分工。

### 9.2 首轮写入范围

- Create: `src/evals/eval-types.ts`
- Create: `src/evals/path-compliance.ts`
- Create: `src/evals/render-quality.ts`
- Create: `src/evals/task-outcome.ts`
- Create: `src/evals/trace-grading.ts`
- Create: `src/planner/sc-spec-schema.ts`
- Create: `src/planner/workflow-selector.ts`
- Create: `src/planner/prompt-templates.ts`
- Create: `docs/design/eval-rubric.md`
- Create: `docs/design/planner-spec.md`

### 9.3 多 agent 的正确引入方式

这一阶段才开始引入窄角色：

- Manager / Planner
- SC Builder
- Evaluator / Critic
- Archivist（可选，后加）

### 9.4 明确不要做

- 不做多 specialist 并行乱跑
- 不做深层递归 subagent
- 不做 shared memory graph 先行

### 9.5 首轮任务拆分

- [x] C1. 定义 `pilot_path_compliance_rate` 等最小指标
- [x] C2. 把 `session-summary` 升级为 `memory-summary`
- [x] C3. 定义结构化 `SC spec`
- [x] C4. 定义 workflow selector：probe / patch refinement / render QA / candidate promotion
- [x] C5. 把多 agent 角色缩到 manager + builder + evaluator
- [x] C6. 让 evaluator 只读 artifact / logs / eval signals，不直接接管代码路径

### 9.6 退出条件

- multi-agent 带来的收益是上下文更干净、责任更稳定、review 更可靠
- 而不是更多 token、更大 prompt、更难定位问题

## 10. Subagent-Driven 执行协议

这里的 multi-agent 不是最终产品结构，而是开发方式。

### 10.1 本线程保留的责任

- 定最终边界
- 定合同
- 定每轮写入范围
- 集成各 worker 的结果
- 做最终 review

### 10.2 explorer 适合做什么

- 查当前 repo 哪些文件已经承担哪些责任
- 查当前测试覆盖到哪一层
- 查某个计划最小写入范围是什么

### 10.3 worker 适合做什么

- 在明确写入边界内实现一个纯模块
- 补一组明确测试
- 做不与其他 worker 冲突的小片实现

### 10.4 什么时候不要委派

- 当任务就是当前关键路径
- 当合同还没定
- 当需要跨多个层级同时重构
- 当需要最终边界判断

### 10.5 review 规则

- 先看合同是否被污染
- 再看模块边界是否被打穿
- 最后看代码质量和测试

## 11. ROI 判断

这条路线值得做，但前提是按顺序做。

### 11.1 值得做的原因

- 它正面解决了“agent 不一定真的走 Pilot”这个根问题
- 它允许周易项目的声音语言长期演化，而不是被早期 prompt 假定
- 它把长期 artistic work 变成可积累系统，而不是一次性会话
- 它对未来别的项目也复用价值高，因为核心资产是 harness / archive / eval / planner 结构

### 11.2 不值得做的方式

- 一开始就上大规模 multi-agent
- 一开始就接一堆高级库
- 一开始就假设 final primitives 已经清楚
- 一开始就做 shared KB / memory graph 大工程

## 12. 最直接的下一步

如果现在进入真正实施，推荐立刻按下面顺序开工：

- [x] Step 1. 按 Plan H 收紧 `runtime` 首轮合同
- [x] Step 2. 紧接着按 Plan A 加最小 route enforcement
- [x] Step 3. 只有前两步稳定后，才开始 Plan B 的 Primitive Lab 外层模块

一句话说，这个 repo 接下来不是去“发明完整周易声音语言”，而是去做一个：

```text
能稳定执行、
能证明自己真的执行了、
能长期积累声音试验轨迹、
能逐步长出项目语言的 SuperCollider Pilot 基础设施
```
