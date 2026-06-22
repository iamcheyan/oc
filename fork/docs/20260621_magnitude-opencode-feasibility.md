# Magnitude 模式在 OpenCode 上的实现可行性分析

> 日期: 2026-06-21
> 基于: magnitude.dev 分析 + OpenCode 架构探索

## 结论: OpenCode 已具备 Magnitude 核心架构的 80%

OpenCode 已经内置了 Magnitude 所声称的大部分能力. Magnitude 的核心不是 "Multi-Agent", 而是 "模型路由 + scoped delegation + per-agent compaction". OpenCode 在这三点上都有现成基础设施:

| Magnitude 特性                | OpenCode 现状                               | 覆盖度 |
|-------------------------------|---------------------------------------------|--------|
| Leader+Worker 路由            | `task` tool + 子Agent定义                    | 80%    |
| 模型路由 (per-turn 不同模型)  | 每条消息携带 `{providerID, modelID, variant}` | 100%   |
| Worker scoped context         | 子session独立, 不共享父session context       | 90%    |
| Per-agent compaction          | 每个session独立compact                       | 100%   |
| Constrained Decoding          | 无 (仅 API provider, 非 llama.cpp)          | 0%     |
| Speculative execution parser  | 无                                           | 0%     |
| Mid-stream schema validation  | 无                                           | 0%     |
| Cache-aware routing           | provider层面的cache, 但非agent层面路由优化   | 30%    |

## OpenCode 已有的关键机制

### 1. 模型路由 (per-turn)

每条用户消息携带 `{providerID, modelID, variant}`. prompt loop 从最新消息读取模型配置用于当前 LLM 调用. 模型切换发出 `SessionEvent.ModelSwitched` 和 `SessionEvent.AgentSwitched` 事件.

这意味着: **同一个session的不同turn可以用不同模型**, 这正是 Magnitude 路由的核心.

关键文件: `packages/opencode/src/session/prompt.ts` (currentModel, createUserMessage)

### 2. Sub-Agent (task tool)

`task` tool 创建子session (`sessions.create({parentID, agent, permission})`), 每个子session:
- 有自己的系统prompt
- 有自己的模型配置
- 有自己的权限规则
- 有自己的compaction周期
- 运行在foreground (阻塞返回结果) 或 background (异步注入结果)

内置Agent:
- `build` (默认, 无限step)
- `plan` (只读模式)
- `general` (通用子agent)
- `explore` (代码探索, 只读)
- `compaction` (隐藏, 内部压缩)
- `title` (隐藏, 生成标题)
- `summary` (隐藏, 摘要)

关键文件: `packages/opencode/src/tool/task.ts`, `packages/opencode/src/agent/agent.ts`

### 3. Agent 自定义配置

每个Agent可以定义:
- `model` — 指定模型
- `variant` — 模型变体
- `temperature`, `topP` — 采样参数
- `steps` — 最大循环次数
- `prompt` — 系统prompt文本; markdown agent 文件应放在 `.opencode/agent/*.md`, 由 `ConfigAgent.load()` 自动发现
- `tools` — 允许的工具列表
- `permission` — 权限规则

Agent可以通过 `Agent.generate()` 动态生成 — LLM根据描述创建新agent配置.

关键文件: `packages/opencode/src/config/agent.ts`, `packages/opencode/src/agent/agent.ts`

### 4. Plugin Hook 系统

OpenCode plugin 可以拦截 session 处理流程, 关键 hooks:

| Hook                              | 用途                                    | 对MinaAI的价值 |
|-----------------------------------|-----------------------------------------|---------------|
| `tool`                            | 注册自定义工具                          | 添加路由工具   |
| `provider`                        | 注册自定义模型provider                  | 添加open模型   |
| `chat.system.transform`           | 修改系统prompt                          | Worker角色注入 |
| `chat.messages.transform`         | 修改消息历史                            | scoped context |
| `experimental.provider.small_model` | 覆盖小模型选择                       | 路由到Flash模型 |
| `experimental.session.compacting`  | 自定义压缩行为                       | 精细压缩控制   |
| `tool.execute.before/after`        | 工具执行前后拦截                     | 路由决策点     |

### 5. MCP Server 支持

完整的 MCP 支持 (local stdio + remote HTTP/SSE), 可以:
- 添加外部工具 (如 web search, database query)
- 配置在 `opencode.jsonc` 的 `mcp` 字段
- 工具名前缀为 `clientName_toolName`

### 6. ACP (Agent Client Protocol)

stdin/stdout JSON 协议, IDE扩展可以通过 ACP 控制 OpenCode session. 支持动态注册 MCP server.

### 7. 文件工具自动发现

`.opencode/{tool,tools}/*.{ts,js}` 自动加载为自定义工具, 无需注册 plugin.

## oh-my-opencode 的关键启发

`oh-my-opencode` 能在任务里分配模型, 不是通过 TUI 保存一个额外 routing 状态实现的. 它走的是两条真正落在 OpenCode 执行链路上的路径:

1. **`config` hook 动态注入 agent 配置**  
   插件读取用户级或项目级 `.opencode/oh-my-opencode.json(c)`, 然后在 `config` hook 里直接改 `config.agent`. 每个 agent 的 `model`, `variant`, `category`, `prompt`, `tools`, `permission` 等最终都会进入 OpenCode core 实际消费的 agent registry.

2. **自定义 `delegate_task` 工具显式传模型**  
   它没有只依赖内置 `task` tool. `delegate_task` 会创建子 session, 解析 `category` 对应模型, 然后调用 `client.session.prompt(...)` 时在 body 里传入 `agent`, `system`, `parts`, 以及可选的 `model`. 这让一次委派可以按任务类别选择模型, 而不是只能依赖静态 agent 默认模型.

结论: 如果 MinaAI 需要“按任务分配模型”, 正确实现点是 OpenCode plugin 或 core session API 层, 不是 `opencode-vim` 的 UI 状态. UI 可以展示和触发, 但不能成为 routing 的 source of truth.

### Vendoring 决定

`oh-my-opencode` 的许可证是 Sustainable Use License 1.0, 不是 MIT/Apache. 因此不要把代码直接散落复制进上游包. 先把原项目作为第三方快照放在 `fork/vendor/oh-my-opencode`, 保留 `LICENSE.md` 和来源 commit, 后续只在 fork-owned adapter 中薄封装需要的部分.

第一批值得适配的模块:

- `delegate_task`: 支持 category/subagent 选择, 显式传 `model`, 并用 `session_id` 续接同一个子任务.
- `background-agent`: 支持并行后台探索和长任务监控.
- `todo-continuation-enforcer`: session idle 但 todo 未完成时自动继续.
- `start-work` + `atlas` + `boulder-state`: 计划文件驱动的长任务执行和恢复.
- `Sisyphus` / `Atlas` / `Prometheus` prompts: 主 agent 编排、计划/执行分离、审查后续修的工作流提示词.

适配原则: vendor 快照不直接改; 新代码放 fork-owned 路径, 从 vendor 中提取最小可用接口. TUI routing 面板可以后续作为配置/展示入口, 但不能作为执行层 source of truth.

## 当前错误实现方向

不要在 `packages/opencode-vim` 里新增 `Agent Model Routing` 面板并写 `.oc/routing.jsonc`. 这个文件只有 fork TUI 会读, OpenCode core 不消费, 因此状态栏显示 `ROUTING` 不代表子 agent 调度真的按该配置执行.

也不要通过 TUI 调 `config.update` 把运行时合并后的 config 写回 `config.json`. 这会污染用户/服务端配置目录, 还可能把合并结果、provider 配置、甚至密钥落到项目工作区. 项目内可复现的 agent 配置应写在 `.opencode/opencode.json(c)` 或 `.opencode/agent/*.md`; 动态策略应通过 plugin `config` hook 或自定义 delegation tool 实现.

## opencode-vim fork 能做什么

fork 当前修改仅涉及 2 个上游 seam 文件 + `packages/opencode-vim/` 包. 已实现:
- vim modal编辑
- model hot-swap (无缝切换模型)
- leader menu
- minimal TUI layout

**fork 可以通过以下方式实现 Magnitude 模式:**

### 方案 A: 纯 Agent 配置 (零代码改动)

在 `opencode.jsonc` 中定义 Magnitude 风格的 Agent:

```jsonc
{
  "agent": {
    "scout": {
      "model": "deepseek-v4-flash",
      "steps": 3,
      "tools": ["read", "glob", "grep"],
      "prompt": "You are a Scout. Explore the codebase efficiently..."
    },
    "architect": {
      "model": "kimi-k2-7-code",
      "steps": 5,
      "tools": ["read", "glob", "grep"],
      "prompt": "You are an Architect. Plan and design..."
    },
    "engineer": {
      "model": "kimi-k2-7-code",
      "steps": 10,
      "tools": ["read", "edit", "write", "bash", "glob", "grep"],
      "prompt": "You are an Engineer. Implement concrete solutions..."
    },
    "critic": {
      "model": "kimi-k2-7-code",
      "steps": 3,
      "tools": ["read", "diff"],
      "prompt": "You are a Critic. Review code for quality..."
    }
  }
}
```

主Agent (`build`) 的系统prompt中加入路由策略: "For complex tasks, use the `task` tool to delegate to specialized agents: scout, architect, engineer, critic."

**优点**: 零代码改动, 利用现有 `task` tool + agent 配置
**缺点**: 路由决策依赖LLM自觉使用 `task` tool, 不是强制路由; 模型选择取决于 provider 是否支持

### 方案 B: Plugin Hook (少量代码)

写一个 OpenCode plugin, 利用 hooks 实现强制路由:

```ts
// .opencode/plugins/model-router.ts
export default async (input) => {
  return {
    // 强制小模型用于探索类工具调用
    experimental_provider_small_model: () => "deepseek-v4-flash",

    // 在系统prompt中注入路由策略
    chat_system_transform: (system, ctx) => {
      // 根据session意图判断是否需要注入Worker路由指令
      return injectRoutingStrategy(system, ctx)
    },

    // 工具执行后触发路由决策
    tool_execute_after: (result, ctx) => {
      // 如果是探索完成, 自动触发下一步实现
      if (ctx.tool === "task" && result.agent === "scout") {
        // 通知session继续delegation
      }
    }
  }
}
```

**优点**: 不改上游代码, 精细控制路由逻辑
**缺点**: plugin hook 可能不够实现完整的 Orchestrator 循环

### 方案 C: 自建 VS Code Extension (ACP/SDK)

使用 OpenCode ACP 或 SDK 创建 VS Code extension, 在 extension 层实现 Orchestrator:

```
VS Code Extension (Orchestrator)
  │
  ├─ 通过 ACP 控制 OpenCode session
  │   ├─ 创建 "build" session → 用户对话
  │   ├─ 创建 "scout" session → 探索 (用Flash模型)
  │   ├─ 创建 "engineer" session → 实现 (用Sonnet模型)
  │   └─ 创建 "critic" session → 审查 (用Haiku模型)
  │
  ├─ 在 extension 层做路由决策
  │   ├─ 分析用户意图
  │   ├─ 决定是否需要delegation
  │   ├─ 管理session之间的结果传递
  │   └─ 控制模型选择
  │
  └─ UI: 任务树视图 + 成本仪表盘
```

**优点**: 完全控制路由逻辑, 不依赖LLM自觉, 独立UI
**缺点**: 需要维护 extension, 与 OpenCode 内部session模型可能不一致

## 三种方案对比

| 维度             | 方案A: Agent配置    | 方案B: Plugin Hook   | 方案C: VS Extension |
|-----------------|--------------------|--------------------|--------------------|
| 代码改动量      | 0 (配置文件)       | 小 (1个plugin文件) | 大 (完整extension) |
| 路由控制度      | 低 (依赖LLM自觉)   | 中 (hook拦截)       | 高 (完全控制)       |
| 模型路由精度    | 中 (per-agent配置) | 高 (per-hook决策)  | 高 (per-task决策)   |
| 上下文隔离      | 高 (子session)     | 高 (子session)     | 高 (独立session)    |
| 成本控制        | 依赖模型定价       | 可拦截优化         | 完全控制            |
| 与上游兼容性    | 100%               | 100%               | 100% (ACP/SDK)      |
| UI 丰富度       | CLI/TUI            | CLI/TUI            | VS Code面板         |
| 维护成本        | 最低               | 低                 | 高                  |
| 实现时间        | 1小时              | 1-2天              | 2-4周               |

## OpenCode 没有 (且 Magnitude 有) 的三项技术

### 1. Constrained Decoding (GBNF grammar)

这是 llama.cpp 的原生能力, OpenCode 使用 API provider (Anthropic, OpenAI, etc.), 无法直接控制模型输出格式.

**但**: API provider 的 structured output (JSON mode, tool_use mode) 已经提供了类似功能. Anthropic 的 tool_use 就是 "constrained output" 的另一种实现. OpenCode 已经使用它.

**对MinaAI的影响**: 如果只用 API provider, 不需要 GBNF. 只有在自托管 llama.cpp 时才需要. 这项技术对 API-based agent 不适用.

### 2. Speculative Execution + Rollback Parser

这是针对 open model streaming output 中歧义决策点的解析策略. OpenCode 使用 Anthropic/OpenAI SDK 的 streaming parser, 这些 parser 已经处理了格式歧义.

**对MinaAI的影响**: 同上, 只有自托管 open model 时才需要. API provider 的 streaming 是结构化的.

### 3. Mid-stream Schema Validation

在 stream 中途做 schema 校验并给模型纠错信号. OpenCode 不做中途校验, 等stream完成后解析.

**对MinaAI的影响**: 这项技术对减少 open model 的 tool call 错误有价值, 但对 API provider (Anthropic tool_use 格式已经很可靠) 不必要.

**结论**: 这三项技术是 **open model 特有的可靠性工程**, 对 API-based agent 不适用. MinaAI 如果以 API provider 为主, 不需要这三项.

## 推荐路径

### MVP: 方案 A + B 混合

1. **第一步 (1小时)**: 用 `.opencode/agent/*.md` 定义 Scout/Engineer/Critic 等子 agent, 并让 `build` prompt 学会使用内置 `task` tool 委派.
2. **第二步 (1-2天)**: 写一个 OpenCode plugin, 用 `config` hook 注入/覆盖 agent 配置, 或新增 `route_task`/`delegate_task` 工具在 `client.session.prompt(...)` 时显式传 `model`.
3. **第三步 (可选)**: 如果需要 UI, 只做配置编辑器或任务树展示; source of truth 仍必须是 OpenCode core 会消费的 config/plugin/session API.

### 为什么不从头自建

- OpenCode 已有 session/engine, tools, compaction, sub-agent, model routing
- 自建 = 重写这所有基础设施, 工程量巨大
- Magnitude 自己也是 Effect+Bun 证明了自建的可行性, 但他们有 YC 资金 + 2人全职
- MinaAI 更好的路径: 在 OpenCode 上叠加路由层, 而不是从零开始

### 关键缺失需补充

| 缺失              | 补充方式                                    | 优先级 |
|-------------------|---------------------------------------------|--------|
| 路由决策自动化    | Plugin hook `chat_system_transform`         | P0     |
| 成本追踪仪表盘    | Plugin `event` hook + UI                    | P1     |
| 任务树可视化      | TUI plugin slot 或 VS extension             | P1     |
| Constrained decoding | 仅自托管时需要, 用 llama.cpp GBNF        | P2     |
| Docker sandbox    | 参考 OpenHands 沙箱设计                     | P3     |

## 实现步骤 (方案 A+B)

### Step 1: Agent 配置

创建 `.opencode/agent/scout.md`, `.opencode/agent/engineer.md`, `.opencode/agent/critic.md` 等系统prompt文件.

在 `opencode.jsonc` 中注册:

```jsonc
{
  "agent": {
    "scout": {
      "model": "anthropic:claude-3-5-haiku",
      "steps": 3,
      "tools": ["read", "glob", "grep", "search"],
      "prompt": ".opencode/agent/scout.md"
    },
    "engineer": {
      "model": "anthropic:claude-sonnet-4",
      "steps": 15,
      "tools": ["read", "edit", "write", "bash", "glob", "grep"],
      "prompt": ".opencode/agent/engineer.md"
    },
    "critic": {
      "model": "anthropic:claude-3-5-haiku",
      "steps": 3,
      "tools": ["read", "diff", "bash"],
      "prompt": ".opencode/agent/critic.md"
    }
  }
}
```

### Step 2: 路由 Plugin

创建 `.opencode/plugins/router.ts`:

- `chat_system_transform`: 根据用户意图注入 "When the task is complex, delegate to specialized agents using the `task` tool" 指令
- `experimental_provider.small_model`: 返回 haiku/flash 用于探索类操作
- `tool_execute.after`: 记录路由决策和成本

### Step 3: 验证

运行 `opencode-vim`, 测试:
- 简单问题 → Leader 直接回答 (不走Worker)
- 复杂任务 → Leader 使用 `task` tool 调用 scout → engineer → critic 流程
- 模型路由 → scout 用 haiku, engineer 用 sonnet, critic 用 haiku
- 成本 → 确认路由后总成本低于单 sonnet 模型

## 与 VS Code Extension 的长期对比

| 时间维度      | Plugin 方案              | VS Extension 方案       |
|--------------|--------------------------|------------------------|
| 1个月        | 路由+成本仪表盘就绪      | 基础extension骨架       |
| 3个月        | 完善路由策略+benchmark   | 完整UI+路由+仪表盘      |
| 6个月        | 依赖OpenCode演进         | 独立演进, 但维护负担大  |
| 1年          | 跟随OpenCode生态         | 可能与OpenCode脱节      |

**建议**: 先用 Plugin 方案做 MVP, 3个月后再评估是否需要 VS Extension. Plugin 方案与上游100%兼容, 不增加维护负担.

---

## oh-my-opencode 适配阶段计划

> 以下阶段基于 `fork/vendor/oh-my-opencode` 快照, 所有适配代码放 `fork/adapter/oh-my-opencode/`.

### 阶段 1: delegate_task 最小适配 (当前)

**目标**: 验证我们能通过 fork adapter 按任务显式指定模型并续接子 session.

支持的能力:
- `subagent_type` — 指定调用哪个 agent
- `model` — `"provider/model"` 格式, 显式传给 `client.session.prompt()`
- `session_id` — 续接已有子 session (保留完整上下文)
- `prompt` / `description` — 任务内容

暂不支持 (后续阶段):
- category fallback chain
- skills 注入
- toast manager
- background execution
- retry hook / task notepad
- Atlas / boulder state

适配方式: 纯函数 + 类型定义, 不接入 OpenCode plugin 启动链路.

### 阶段 2: background-agent (后续)

**目标**: 支持并行后台探索和长任务监控.

依赖: 阶段 1 的 `delegate_task` 接口稳定后, 再对接 vendor 的 `BackgroundManager`.

### 阶段 3: Atlas / boulder / start-work (远期)

**目标**: 计划文件驱动的长任务执行和恢复机制.

依赖: 阶段 2 稳定, 且 OpenCode plugin API 对 session lifecycle 的支持足够.

### 不做的事

- TUI routing 面板不作为执行层 source of truth
- 不把 vendor 代码散落复制到 upstream 包
- 不修改 vendor 源文件, 除非有明确理由并先停下说明
- 不提前实现阶段 2/3 的能力

### License 注意事项

`oh-my-opencode` 使用 Sustainable Use License 1.0 (非 MIT/Apache).
- vendor 快照在 `fork/vendor/oh-my-opencode/`, 保留 `LICENSE.md` 和来源说明.
- fork adapter 是薄封装层, 不复制 vendor 实现到 upstream-owned 路径.
- 如果需要修改 vendor 文件, 先停下说明原因, 由 reviewer 判断.
