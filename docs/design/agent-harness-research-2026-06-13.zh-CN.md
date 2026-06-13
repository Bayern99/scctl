# 非音乐 Agent 项目对 SuperCollider Pilot / Harness 的启发

Date: 2026-06-13  
Repo: `supercollider-pilot`  
Audience: internal  
Language: 中文

## 1. 研究问题

这份简报不讨论“周易项目最终声音应该是什么”，而讨论另一个更基础、也更可搜索验证的问题：

```text
在音乐项目之外，成熟 agent 系统是如何提升以下能力的：

1. 让 agent 稳定地走指定工具 / 指定执行路径
2. 让长期 memory 真正有用，而不是只是堆上下文
3. 让 artifacts / traces / trajectory 成为长期改进资产
4. 让 multi-agent 不至于失控
5. 让 harness 真正比 prompt 更有约束力
```

然后再反推：

```text
对 SuperCollider Pilot 来说，
哪些做法值得直接借鉴，
哪些不值得现在引入
```

## 2. 研究方法

这轮研究优先使用**官方一手资料**，不依赖二手解读。

本次对照的主要对象：

- OpenAI Agents SDK / Cookbook / Codex docs
- Anthropic Claude Code docs
- MCP 官方规范
- LangChain / LangGraph / Deep Agents 官方文档
- OpenHands 官方文档
- aider 官方文档

研究重点不是“哪个框架最强”，而是看它们在**可靠性、调用纪律、长期运行**上的共同模式。

## 3. 主要结论

## 3.1 第一结论：真正可靠的系统，靠 harness，不靠 prompt

这是最重要的共识。

OpenAI 官方把 agent 的核心原语概括为：

- models
- tools
- state / memory
- orchestration

并明确把“评估与优化”作为构建 agent 的核心工作之一。  
如果应用自己掌握 orchestration、tool execution、state、approvals，就应该用 SDK 路线，而不是把这些责任丢给模型自行发挥。

Anthropic 的资料则更直接：  
`CLAUDE.md` 之类说明文件是 advisory，而 hooks 是 deterministic。也就是：

```text
instruction 会影响行为，
hook 才能强制行为
```

### 对 Pilot 的直接启发

如果你的目标是：

```text
让 agent 每次都用 MCP / CLI / Pilot，
而不是口头说自己用了
```

那系统重点不能放在“写一份更聪明的 skills 提示词”，而必须放在：

- tool boundary
- hook
- approval
- artifact contract
- trace / audit

也就是说：

```text
skills 是辅助手册，
harness 才是制度
```

## 3.2 第二结论：最佳实践不是“开放更多工具”，而是“把工具面收窄并结构化”

MCP 官方规范里，`tools`、`resources`、`prompts` 是三种不同能力：

- `tools`：执行外部动作
- `resources`：提供上下文数据
- `prompts`：提供结构化工作流提示

而且 tool 本身应有：

- `description`
- `inputSchema`
- 可选 `outputSchema`

这些不是装饰信息，而是帮助客户端和模型理解工具能力的结构化合同。

LangChain / Deep Agents 也把 harness 的能力拆得很明确：

- execution environment
- context management
- delegation
- steering

这说明成熟系统的做法不是“加更多自由度”，而是把不同责任分层。

### 对 Pilot 的直接启发

现在这个 repo 最该补强的不是“更多音乐功能”，而是更强的**结构边界**：

1. `tools`  
   `sc_check`、`sc_eval`、`sc_run_file`、`sc_render`、`sc_logs`、`sc_stop` 等继续做窄做清楚。

2. `resources`  
   后面应该补项目上下文资源，而不是把所有项目知识塞进 prompt：
   - 当前 primitive candidate registry
   - exemplar archive
   - failure signatures
   - style pack docs

3. `prompts`  
   后面可以把固定 workflow 做成可调用 prompt template，而不是每次靠 agent 现编：
   - primitive probe workflow
   - render QA workflow
   - candidate promotion workflow

## 3.3 第三结论：要确保 agent 走指定路线，最有效的是“就地校验”

OpenAI 官方在 guardrails / approvals 文档中把控制分成：

- input guardrails
- output guardrails
- tool guardrails
- human review

并特别强调：

```text
如果你需要检查每一次 custom tool call，
不要只靠 agent-level input/output guardrails，
而是把校验放到具体 tool 旁边
```

这对你现在的问题非常关键。

因为你现在担心的不是“用户输入不安全”，而是：

```text
agent 会不会绕开 Pilot
```

这个问题本质上发生在**tool boundary**，不是发生在用户输入层。

Anthropic 的 hooks 文档也提供了同样方向：  
hook 可以在工具调用、session lifecycle 等关键点自动执行，并提供 deterministic control。  
Codex 的 auto-review 也说明了一件事：当动作要跨越边界时，可以由独立 reviewer agent 代替人工审批，但边界本身不因此消失。

### 对 Pilot 的直接启发

真正该做的是：

#### 1. 对 SC builder agent 收紧工具面

只给它这些能力：

- `sc_eval`
- `sc_run_file`
- `sc_render`
- `sc_logs`
- 少量只读文件工具

不要默认同时给它一堆 Python 音频生成路线。

#### 2. 在 tool 旁边做约束

例如：

- 如果任务被标记为 `sc-audio-generation`
- 那么完成条件必须包含 `Pilot render artifact`
- 没有 artifact 就不能宣称完成

#### 3. 引入显式 review gate

不是所有动作都需要人工 review，  
但以下动作建议有 gate：

- primitive candidate promotion
- 新增高权限外部工具
- 写入长期 memory / archive 的摘要

## 3.4 第四结论：memory 不能等同于“长期参数表”

LangGraph / LangChain 的官方区分很有用：

- short-term memory：thread-scoped，会话内状态
- long-term memory：跨 session、跨 thread 的持久记忆

OpenHands 更进一步，把 conversation persistence 写得很具体。它持久化的不是一句“记住用户偏好”，而是：

- message history
- agent configuration
- execution state
- tool outputs
- workspace context
- activated skills
- custom runtime state

OpenHands 的 event system 甚至明确把事件流定义为：

```text
append-only log
```

并把它同时作为 memory 和 auxiliary service 的集成点。

这对你现在的艺术系统尤其重要，因为你反复强调了一点：  
primitive / parameter 不会很快定下来。

这意味着 memory 的职责不应该是：

```text
保存最终答案
```

而应该是：

```text
保存长期判断轨迹
```

### 对 Pilot 的直接启发

建议把记忆拆成三层：

#### A. 运行态 memory

只管当前 session：

- 当前任务
- 当前 patch
- 当前 render 结果
- 当前错误状态

#### B. 项目态 archive

面向长期创作积累：

- probe patch
- render artifact
- 简短评语
- primitive candidate 变更记录
- 被否决原因

#### C. 抽象态 memory summary

不保存太多原始细节，而保存长期归纳：

- 哪类 timbral family 经常有潜力
- 哪类 prompt 容易变空
- 哪类 primitive 经常被淘汰
- 哪些 failure mode 重复出现

也就是说：

```text
真正重要的不是“记住参数”，
而是“记住判断演化”
```

## 3.5 第五结论：multi-agent 的最佳用法是收窄角色，不是扩大系统

OpenAI 官方在 orchestration 文档里给出的一个非常实用的模式是：

```text
manager-style workflow
```

即主 agent 保持最终责任，把 specialist 当作工具来调用，而不是让多个 agent 平权乱跑。

Codex 的 subagents 文档也有两个很重要的点：

1. subagent 默认不会自动乱生，必须显式请求
2. subagent 继承当前 sandbox policy

而且官方明确提醒：  
深层递归 delegation 会带来 token、延迟和可预测性风险。

aider 的 architect/editor 模式提供了另一个有价值的分工启发：

```text
reasoning 和 editing 分离
```

先让一个模型 / agent 做“怎么做”的方案，再让另一个模型 / agent 做“如何格式化修改”的执行。

### 对 Pilot 的直接启发

你现在最适合的不是 full multi-agent mesh，而是很窄的三段式：

#### 1. Planner

负责：

- 理解当前任务
- 选 workflow
- 决定是 probe、patch 还是 render QA

#### 2. SC Builder

负责：

- 只通过 Pilot 写 / 跑 SC
- 只对当前小任务负责

#### 3. Critic / Evaluator

负责：

- 看 artifacts
- 看日志
- 给出继续 / 回退 / 晋升建议

这个结构比“大量 agent + shared memory + 各自发挥”稳得多。

## 3.6 第六结论：长期改进靠 traces + evals，不靠主观印象

OpenAI Cookbook 里关于 agent improvement loop 的核心做法是：

```text
real traces
-> human / model feedback
-> evals
-> next harness changes
```

这其实非常适合你现在这个项目。

因为你现在最不需要的就是：

```text
纯感觉地认为某个流程“好像更聪明”
```

你需要的是：

```text
哪些流程更能让 agent 走 Pilot
哪些流程更容易 drift
哪些 hook 能减少绕路
哪些 artifact contract 真能提高完成率
```

OpenHands 也把 evaluation harness、critic、trajectory、context condenser 全做成了明确系统件，而不是“以后再看”。

aider 更简单，但方向一致：  
每次修改之后自动 lint / test，这本质上也是一种局部 eval harness。

### 对 Pilot 的直接启发

你后面最该做的不是马上构造大 memory，而是先构造最小评估闭环：

1. 每次任务有没有真的走 Pilot
2. 有没有生成 artifact
3. 有无错误回退
4. 最终结果是否被 reviewer 接受

这些数据积累起来之后，才能反过来优化 skills 和 harness。

## 3.7 第七结论：sandbox / approvals / isolation 不是企业附加项，而是基础设施

Codex、OpenHands、Claude Code 这些系统在安全和可控性上有很强的共同点：

- 默认缩小执行边界
- 明确 approval 机制
- 把沙箱和真实宿主环境区分开

OpenHands 默认推荐 Docker sandbox，因为它提供：

- isolation
- reproducibility

而 Process sandbox 被明确标成：

```text
无隔离，只能在受控环境使用
```

Codex 文档也明确写了：

- 默认网络关闭
- OS enforced sandbox
- approval policy 控制跨边界动作

### 对 Pilot 的直接启发

对这个项目来说，这一层的意思不是“把一切云化”，而是：

```text
让 agent 有明确可控的边界，
让高风险动作不是悄悄发生
```

尤其是后面如果你给 agent 加：

- 文件写入
- render archive 写入
- 长期 memory 写入
- 外部服务访问

那这些都应该有边界意识。

## 4. 交叉比较：哪些模式是真共识

跨这些系统看，真正的共识不是“大家都用 multi-agent”，而是下面几条：

### 共识 1：instructions 不是最终约束

真正的最终约束来自：

- hooks
- approvals
- tool guardrails
- sandbox
- evals

### 共识 2：memory 要分层

至少要分：

- 当前线程状态
- 长期项目记忆
- 轨迹 / 事件日志

### 共识 3：trace / trajectory / artifact 是一等公民

不是“做完之后顺手存一下”，而是系统本体的一部分。

### 共识 4：multi-agent 要窄角色、低深度

最稳的是 manager + specialist，不是大家一起思考人生。

### 共识 5：评估闭环必须前置

不是“等系统成熟后再做 eval”，而是：

```text
没有 eval，就没有可靠的 agent 改进
```

## 5. 对 `supercollider-pilot` 的直接建议

## 5.1 现在最值得做的不是“大而全架构”，而是“四件基础设施”

### 第一件：Pilot 路线强约束

定义一条明确规则：

```text
凡是标记为 SC 音频生成任务，
主执行路径必须经过 Pilot
```

### 第二件：Artifact contract

完成一个任务，至少留下：

- source patch / `.scd`
- render artifact
- 简短评语
- 状态标签（candidate / accepted / rejected / revisit）

### 第三件：Append-only archive

不要只保留“最后版本”，而要保存演化过程。

因为你这个项目的重点本来就是长期演化。

### 第四件：最小 eval harness

至少衡量：

- 是否走 Pilot
- 是否成功 render
- 是否触发 logs / recovery
- 是否被 reviewer 接受

## 5.2 现在不建议优先做的事

### 1. 大型 shared-memory graph

太早。现在会加大系统复杂度，收益不明显。

### 2. 大规模 multi-agent fan-out

太早。会增加 token 消耗、上下文漂移和治理成本。

### 3. 先做“最终声音 ontology”

不现实，也和项目实际创作节奏不匹配。

### 4. 把 memory 当成参数数据库

会误导系统设计。

## 5.3 现在最值得借鉴的外部模式

### 借鉴 1：Claude / Codex 的 deterministic hooks 思路

用于：

- 强制任务走 Pilot
- 拦截不合规工具调用
- 在关键步骤后自动校验 artifact

### 借鉴 2：OpenAI 的 tool guardrails + human review 分层

用于：

- 区分输入校验、工具校验、审批动作
- 让“边界动作”显式停下来

### 借鉴 3：OpenHands 的 append-only event / trajectory / critic

用于：

- 长期保留试验轨迹
- 给后续迭代提供依据
- 让“失败”也成为数据资产

### 借鉴 4：LangGraph / Deep Agents 的 memory layering

用于：

- 区分 session state / long-term memory / context offloading
- 避免把所有东西都混成一个上下文黑箱

### 借鉴 5：aider 的 architect / editor 分工

用于：

- 把“想怎么做”和“怎么按格式执行”拆开
- 减少单 agent 同时承担推理和执行时的失真

## 6. 最终判断

如果回到你真正的问题：

```text
有没有必要搜索别的 agent 项目怎么 boost 这些东西？
```

答案是：

```text
有必要，而且结果很明确：
成熟系统的提升重点，不是“更聪明的 prompt”，
而是更硬的 harness、更窄的工具面、更清楚的 memory 分层、
更完整的 trajectory / artifact 留痕，以及更早的 eval 闭环。
```

对 `supercollider-pilot` 来说，这意味着：

1. 先把 `Pilot + harness` 这一层做硬
2. 再把 `artifact / archive / critic / memory summary` 做出来
3. 最后再考虑更大的 multi-agent 结构

也就是说，接下来 plan 阶段最稳的对象，不是“完整音乐语言”，而是：

```text
SuperCollider Pilot Harness + Primitive Lab Infrastructure
```

这是一个 agent 系统计划，不是一个“先假设艺术参数会快速收敛”的计划。

## 7. 参考来源

- OpenAI Building agents: https://developers.openai.com/tracks/building-agents
- OpenAI Agents SDK: https://developers.openai.com/api/docs/guides/agents
- OpenAI Guardrails and human review: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
- OpenAI Orchestration and handoffs: https://developers.openai.com/api/docs/guides/agents/orchestration
- OpenAI Results and state: https://developers.openai.com/api/docs/guides/agents/results
- OpenAI Agent improvement loop: https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop
- OpenAI Reliable agents with memory and compaction: https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction
- OpenAI Governed AI agents: https://developers.openai.com/cookbook/examples/partners/agentic_governance_guide/agentic_governance_cookbook
- Anthropic Claude Code hooks guide: https://code.claude.com/docs/en/hooks-guide
- Anthropic Claude Code hooks reference: https://code.claude.com/docs/en/hooks
- Anthropic Claude Code memory: https://code.claude.com/docs/en/memory
- Anthropic Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- MCP Tools spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Resources spec: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP Prompts spec: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
- MCP Schema reference: https://modelcontextprotocol.io/specification/2025-06-18/schema
- LangChain Memory overview: https://docs.langchain.com/oss/python/concepts/memory
- LangChain Deep Agents harness: https://docs.langchain.com/oss/python/deepagents/harness
- LangChain Deep Agents customization: https://docs.langchain.com/oss/python/deepagents/customization
- OpenHands persistence: https://docs.openhands.dev/sdk/guides/convo-persistence
- OpenHands context condenser: https://docs.openhands.dev/sdk/guides/context-condenser
- OpenHands critic: https://docs.openhands.dev/sdk/guides/critic
- OpenHands evaluation harness: https://docs.openhands.dev/openhands/usage/developers/evaluation-harness
- OpenHands Docker sandbox: https://docs.openhands.dev/openhands/usage/sandboxes/docker
- OpenHands process sandbox: https://docs.openhands.dev/openhands/usage/sandboxes/process
- aider architect mode: https://aider.chat/docs/usage/modes.html
- aider linting and testing: https://aider.chat/docs/usage/lint-test.html
