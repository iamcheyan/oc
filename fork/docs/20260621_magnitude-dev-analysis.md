# Magnitude.dev 深度分析

> 研究日期: 2026-06-21
> 来源: magnitude.dev, docs.magnitude.dev, npm README, YC profile, LinkedIn, GitHub, Hacker News

## 1. Agent 架构

### 核心模式: Leader + Worker (Supervisor / Task Routing)

Magnitude 采用 **Leader + Worker** 的 Supervisor 模式, 不是对等的 Multi-Agent 系统:

```
User
  ↓
Leader (GLM 5.2) ← 持有对话意图, 决策调度
  ↓ delegate
  ├─ Scout (DeepSeek V4 Flash)     ← 快速探索, 成本低
  ├─ Architect (Kimi K2.7 Code)    ← 高层规划
  ├─ Engineer (Kimi K2.7 Code)     ← 具体实现
  ├─ Critic (Kimi K2.7 Code)       ← 独立审查
  └─ Scientist (Kimi K2.7 Code)    ← 实证调试
  ↓ output back
Leader ← 审阅结果, 决定下一步
  ↓
User
```

### 关键特征

- Leader 占约 50% 总 Token, Worker 占约 50%
- Worker 是 **预定义角色**, 不是动态创建. 每个 Worker = `system prompt + scoped context + scoped toolset + model + reasoning level`
- Leader 自己处理简单任务, 只有大任务才委派
- Worker 完成后, Leader 审阅输出并决策下一步 — 循环反馈环
- Worker **不直接通信**, 通过 Leader 中转
- 从文档看没有并行执行的证据 — Worker 是顺序被 Leader 调度
- 每个 Agent 独立 compact (压缩上下文), 不共享一个膨胀的 context

### 实质: 不是真正的 Multi-Agent

这是 **单 Agent + Task Routing**, 不是真正的 Multi-Agent 协调:
- Leader 是唯一的 Orchestrator
- Worker 只是 Leader 的不同 "工具调用模式", 实质是换了 system prompt + 模型的子请求
- 没有独立的 Agent-to-Agent 协议
- 没有消息队列或事件驱动协调

## 2. 成本优化策略

这是 Magnitude **真正有技术价值** 的核心:

### 模型路由 + 价格矩阵

| 角色         | 模型             | Input/1M | Cached/1M | Output/1M | 用途           |
|-------------|-----------------|----------|-----------|-----------|---------------|
| Leader      | GLM 5.2         | $1.40    | $0.26     | $4.40     | 规划+对话      |
| Scout       | DeepSeek V4 Flash | $0.14  | $0.04     | $0.28     | 探索           |
| Others      | Kimi K2.7 Code  | $0.95    | $0.16     | $4.00     | 执行           |

### 关键技巧

- 90% 的 input token 在首轮之后走 **cache**, 实际成本接近 cached 列
- 简单任务 Leader 直接处理 (不走 Worker)
- Scout 用最便宜的 Flash 模型做探索 (大量 token 但低价值)
- 只有需要高质量推理的才用 Kimi K2.7 Code

### 对比 Claude Code 单 Agent

- Claude Sonnet: ~$3/M input, ~$15/M output
- Magnitude 混合: 约 $0.5/M 有效 input (cache + 路由)
- 声称 60% 成本下降 — 在 open 模型语境下可信

### 三个独有的工程手段 (npm README 揭示)

1. **Constrained Decoding** — 自定义 GBNF grammar 防止 open model 的常见失败模式 (overthinking, malformed tool calls)
2. **Speculative Execution + Rollback** — 解决 open model 输出的歧义决策点, 对 streaming output 做 speculative commit + rollback
3. **Mid-stream Schema Validation** — 在 stream 中途就做 schema 校验, 给模型纠错信号

这三点才是真正的工程创新, 比 "Leader+Worker" 包装更值得学习.

## 3. 与竞品对比

| 特征       | Magnitude             | Claude Code    | OpenCode       | Devin          | OpenHands        | Cursor          | Kiro             |
|-----------|-----------------------|---------------|---------------|---------------|-----------------|----------------|-----------------|
| 架构      | Leader+Worker路由     | 单Agent循环   | 单Agent+SessionV2 | 单Agent+沙箱 | 单Agent+Canvas  | 单Agent(IDE内)  | Spec->Spec->Code |
| 多Agent   | 伪多Agent(路由)       | 无            | 无            | 无            | 可接多个Agent   | 无             | 无               |
| 模型      | Open模型路由          | Claude专有    | 可配置        | Claude专有    | 可配置          | 可配置         | Claude专有       |
| 成本策略  | 模型路由+cache        | 单模型        | 可选便宜模型  | 高成本        | BYO model       | 订阅制         | 订阅制           |
| 沙箱      | 无                    | 本地执行      | 本地执行      | Docker沙箱    | Docker沙箱      | 本地执行       | 本地执行         |
| 上下文压缩| 每Agent独立compact    | 内置compact   | Session compaction | 内置    | 内置            | 内置           | 内置             |
| 技术栈    | Effect+OpenTUI+Bun   | Rust+TS       | Effect+Bun    | 未知          | Python+Docker   | TypeScript     | 未知             |

### 关键差异

- **Devin / OpenHands** 真正用了 Docker sandbox — Magnitude 没有
- **OpenCode** 和 Magnitude 都用 Effect + Bun — OpenCode 是开源的
- **Kiro** 的 Spec-driven 流程是独特设计思路
- **Cursor** 是 IDE 集成而非 CLI

## 4. MinaAI MVP 架构

### 架构图

```
┌─────────────────────────────────────────────────┐
│                    User                          │
│                  (CLI / TUI / VS Code Extension) │
└────────────────────┬────────────────────────────┘
                     │ prompt
                     ▼
┌─────────────────────────────────────────────────┐
│              Orchestrator                        │
│  ┌─────────────────────────────────────┐        │
│  │ Intent Analysis                      │        │
│  │ Task Decomposition                   │        │
│  │ Routing Decision (simple→direct)     │        │
│  │ Result Review                        │        │
│  │ State Management                     │        │
│  └─────────────────────────────────────┘        │
│  Model: Haiku / Mini (cheap, fast)              │
│  Context: global summary + task tree            │
└────────────────────┬────────────────────────────┘
                     │ delegate (scoped prompt)
          ┌──────────┼──────────┐
          ▼          ▼          ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Research  │ │Implement │ │  Review  │
   │           │ │          │ │          │
   │ Flash模型 │ │ Sonnet级 │ │ Haiku级  │
   │ scoped ctx│ │ scoped   │ │ scoped   │
   │ read/grep │ │write/bash│ │ read/diff│
   └──────────┘ └──────────┘ └──────────┘
          │          │          │
          └──────────┼──────────┘
                     │ structured result
                     ▼
              Orchestrator review
                     │
              ┌──────┴──────┐
              │  done?      │
              │  retry?     │
              │  re-route?  │
              └─────────────┘
```

### 数据流

```
User Prompt
    │
    ▼
[1] Orchestrator receives prompt + cached context
    │
    ▼
[2] Intent analysis → decide: direct answer OR delegate
    │
    ├── simple → direct response → User
    │
    ▼ complex
[3] Task decomposition → scoped prompt per Worker
    │   (extract relevant files, compress history)
    │
    ▼
[4] Worker call (one turn, scoped context)
    │   Model processes → constrained decoding
    │   Stream parse → speculative + rollback
    │   Mid-stream validation → corrective feedback
    │
    ▼
[5] Worker returns structured result
    │   (summary, not full conversation)
    │
    ▼
[6] Orchestrator reviews → decide next action
    │
    ├── accept → [7] compose response → User
    ├── reject → [4'] retry with different strategy
    ├── need more → [3'] decompose sub-task
    │
    ▼
[7] Response to User + update task state
    │
    ▼
[8] Compact Orchestrator context for next turn
    │   (per-agent independent compaction)
```

### Agent 职责定义

| Agent       | 职责                          | 模型建议                    | 工具                          |
|-------------|------------------------------|----------------------------|-------------------------------|
| Orchestrator| 意图理解, 任务分解, 结果审阅, 决策 | GPT-4o-mini / Claude Haiku | 仅对话 + delegate              |
| Researcher  | 代码探索, 信息收集              | DeepSeek V3 / Gemini Flash | file_read, grep, glob, web_search |
| Implementer | 编写代码, 运行测试              | Claude Sonnet / Kimi K2    | file_write, bash, file_edit   |
| Reviewer    | 代码审查, 质量分析              | Claude Haiku / DeepSeek V3 | file_read, diff               |

### 通信机制

- Orchestrator → Worker: 发送 scoped prompt (仅相关上下文)
- Worker → Orchestrator: 返回结构化结果 (不是全量对话)
- Worker 之间 **不直接通信**, 全部通过 Orchestrator

### 上下文管理 (避免爆炸)

1. Worker 只拿到 **scoped context** (Orchestrator 筛选后的相关文件/信息)
2. 每个 Worker **独立压缩**, 不传回全量对话历史
3. Orchestrator 维护 **摘要式全局状态** (当前任务树 + 各节点状态)
4. Worker 返回的是 **结构化摘要**, 不是原始输出

### Token 成本控制

1. 90%+ 的探索工作用 Flash 级别模型
2. 只有实现和关键决策用 Sonnet 级别
3. Heavy caching (prompt cache / KV cache)
4. Orchestrator 用 Haiku 级别做路由 (不需要强推理)
5. Worker 的 system prompt 固定 → cache 友好

### 长任务管理

1. Orchestrator 维护任务状态树 (admitted → in_progress → completed)
2. 每个 Worker 调用是一次完整的 turn (不是长连接)
3. 失败的 Worker 输出可以重试 (换模型或换策略)
4. 全局 checkpoint — 可从任意节点恢复

## 5. 开源组件评估

| 框架              | 优点                         | 缺点                       | 适合MinaAI?    |
|------------------|-----------------------------|---------------------------|---------------|
| Claude Code SDK  | 最成熟的单Agent实现, 生产级   | 闭源, 绑定Claude           | 参考, 不依赖   |
| OpenAI Agents SDK| 官方, 轻量, Python           | 生态年轻, 功能少           | 可选但轻       |
| LangGraph        | 状态机+图, 灵活              | 过度抽象, debug难, Python  | 不推荐         |
| CrewAI           | 角色定义直观                 | 假Multi-Agent(顺序调用), overhead大 | 不推荐 |
| AutoGen          | 真正的对话式Multi-Agent      | 过度复杂, 不适合coding场景  | 不推荐         |
| OpenHands        | 生产级沙箱+Canvas            | Python, 架构重             | 参考沙箱设计   |
| **Effect + Bun** | 类型安全, 函数式, 高性能     | 学习曲线                   | **强烈推荐**   |
| OpenTUI          | TUI渲染, CLI友好             | 新项目                     | 可选           |

推荐: **Effect + Bun 自建**. 不需要 CrewAI/LangGraph 的过度抽象 — Leader+Worker 路由用 Effect 的 Stream + Schedule 就能实现. Effect 的 Schema 和 error handling 天然适合 constrained decoding 和 mid-stream validation.

## 6. 对 MinaAI 的具体建议

### 值得借鉴

1. **模型路由** — 真正的成本杠杆. 不是 "多Agent", 而是 "同一Agent的不同turn用不同模型"
2. **Constrained Decoding (GBNF grammar)** — 控制模型输出格式, 防止 tool call 格式错误
3. **Speculative execution + rollback** — 解析 streaming output 时对歧义做 speculative commit + rollback
4. **Mid-stream schema validation** — 不等 stream 结束就校验, 提前给纠错信号
5. **Per-agent independent compact** — 每个子任务独立压缩, 避免共享膨胀 context
6. **Scoped context delivery** — Worker 只拿相关上下文, 不全量传入
7. **Workspace concept ($M)** — 临时 workspace 做计划和共享中间结果

### 不值得复制

1. **Worker 不并行** — Magnitude 的 Worker 是顺序调用的, 没有真正的并行优势
2. **固定角色集** — 5个固定 Worker 是过度设计. MVP 只需要 Researcher + Implementer + Reviewer
3. **闭源** — 无法验证其声称的 benchmark
4. **无沙箱** — 没有 Docker/VM sandbox, Agent 直接操作本机文件系统

### 营销包装 (需警惕)

1. "Multi-Agent" — 实际是 Leader + Task Routing, 不是真正的 Multi-Agent 协调
2. "60% 成本低于 Claude Code" — 只在 open model 语境下有意义, 用 Claude 就没这个优势
3. "curated system of specialized agents" — 实质就是 5 个不同 system prompt + model 配置

### 真正有技术价值的

1. Constrained decoding (GBNF grammar)
2. Speculative execution parser
3. Mid-stream schema validation
4. Cache-aware model routing
5. Scoped context delivery pattern

## 7. 公司背景

- **创始团队**: Tom Greenwald (CEO, 前SimpliSafe PM) + Anders Lie (CTO, 前AWS SWE)
- **历史**: 先做 Sidekick (Zapier式自动化), 重命名为 Sagekit, 再转型为 Magnitude (coding agent)
- **YC**: Summer 2025 batch, Pre-seed $500K
- **团队规模**: 2人
- **开源**: GitHub 仓库只有 releases, 源代码不公开
- **HN 热度**: 5 points, 极低关注度
- **技术栈**: Effect + OpenTUI + Bun (与 OpenCode 相同基础)

## 8. MVP 实现路线

### Phase 1 (2 weeks): 单Agent + 模型路由

- Effect + Bun 项目骨架
- 单 Orchestrator 实现 (直接处理所有任务)
- 模型路由层 (Haiku/Sonnet/Flash 按任务类型选择)
- Streaming parser + basic tool execution
- CLI/TUI 基础界面

### Phase 2 (2 weeks): Worker delegation

- Worker role 定义 (Researcher, Implementer, Reviewer)
- Scoped context delivery (Orchestrator → Worker 的 context 筛选)
- Structured result return (Worker → Orchestrator)
- Per-agent compaction

### Phase 3 (2 weeks): Reliability

- Constrained decoding (GBNF grammar for tool calls)
- Mid-stream schema validation
- Speculative execution + rollback parser
- Error recovery + retry logic

### Phase 4 (ongoing): 模型优化

- Benchmark + continuous model evaluation
- Cache optimization (prompt prefix caching)
- Cost tracking + reporting

## 9. 推荐技术栈

| 层             | 选择                     | 原因                          |
|---------------|--------------------------|-------------------------------|
| Runtime       | Bun                      | 快启动, Bun.file() 等 API      |
| Framework     | Effect v4                | 类型安全, Stream, Schedule, Schema |
| TUI           | OpenTUI / Ink            | CLI 渲染                      |
| 模型路由      | 自建 (Effect Stream)     | 不需要 LangGraph               |
| Grammar       | llama.cpp GBNF           | constrained decoding          |
| Schema        | Effect Schema            | mid-stream validation         |
| 存储          | SQLite (Drizzle)         | session 持久化                 |
| 沙箱          | Docker (Phase 5)         | 安全执行                       |

## 10. 推荐阅读资料

1. **GBNF Grammar / Constrained Decoding** — llama.cpp 文档, 了解 grammar 如何约束模型输出
2. **Speculative Decoding** — 了解投机执行在 LLM 推理中的应用
3. **Effect v4 Stream + Schedule** — 理解如何用 Effect 实现异步路由
4. **OpenCode 源码** — `packages/opencode` — 看生产级 Effect + Bun Agent 实现
5. **Anthropic Prompt Caching** — 了解 90% cache rate 的实现原理
6. **SWE-bench / Pareto Bench** — 理解 coding agent benchmark 设计
7. **"ReAct" paper (Yao et al. 2023)** — Reasoning + Acting 范式的基础
8. **"Planning with Language Models" (2023)** — LLM 作为规划器的研究
