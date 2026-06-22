# oh-my-opencode 适配工作流

> 日期: 2026-06-21
> 目的: 让低成本模型先执行明确、受限的适配任务, 再由高质量 reviewer 检查结果.

## 总目标

把 `oh-my-opencode` 里对我们有价值的 orchestration 能力搬到 fork-owned 范围内, 先做最小可用链路:

1. vendor 原项目源码快照.
2. 写清楚准备适配哪些模块.
3. 第一阶段只接 `delegate_task`.
4. 第二阶段再接 `background-agent`.
5. 第三阶段才考虑 `Atlas` / `boulder` 长任务机制.

当前先执行 **1-3**. 不要提前做 4-5.

## 边界

- 所有新增适配代码必须放在 `fork/**` 或其他明确 fork-owned 路径.
- 不要修改 upstream-owned core 包, 除非文档明确要求.
- 不要修改 `packages/opencode-vim` 的 TUI routing 面板; 那部分已暂存, 后续再处理.
- 不要把 vendor 代码散落复制到 upstream 包.
- `fork/vendor/oh-my-opencode` 是第三方快照, 尽量不要直接改里面的文件.
- 如果必须修改 vendor 文件, 先停下并说明原因.
- 保留 `oh-my-opencode` 的 `LICENSE.md` 和来源说明.

## 已知背景

`oh-my-opencode` 的关键点不是 TUI 开关, 而是执行层:

- 用 plugin `config` hook 注入 agent 配置.
- 用 `delegate_task` 创建或续接子 session.
- 调 `client.session.prompt(...)` 时显式传 `model`.
- 失败/审查不通过时用同一个 `session_id` 继续原 worker.

许可证是 Sustainable Use License 1.0, 不是 MIT/Apache. 所以先 vendor 到 fork 下, 后续通过 adapter 薄封装.

## 阶段 1: Vendor 快照确认

目标: 确认 `oh-my-opencode` 已经完整放入 fork vendor 目录.

检查项:

- `fork/vendor/oh-my-opencode/LICENSE.md` 存在.
- `fork/vendor/oh-my-opencode/README.vendor.md` 存在.
- `fork/vendor/oh-my-opencode/src/tools/delegate-task/tools.ts` 存在.
- `fork/vendor/oh-my-opencode/.git` 不存在.

如果缺失:

- 从 `https://github.com/opensoft/oh-my-opencode` 复制源码快照到 `fork/vendor/oh-my-opencode`.
- 不要复制 `.git`.
- 在 `README.vendor.md` 写来源仓库、commit、许可证、适配边界.

交付物:

- vendor 目录完整.
- README vendor 说明完整.

## 阶段 2: 适配说明文档

目标: 写清楚哪些模块会适配, 为什么适配, 以及暂时不适配什么.

更新或创建文档:

- `fork/docs/20260621_magnitude-opencode-feasibility.md`
- 必要时新增补充文档.

必须写清楚:

- `delegate_task` 是第一阶段目标.
- `background-agent` 是第二阶段目标.
- `Atlas` / `boulder-state` / `start-work` 是第三阶段目标.
- TUI routing 面板不能作为执行 source of truth.
- source of truth 应该是 OpenCode core 会消费的 config/plugin/session API.
- vendor 代码暂不直接改, 通过 fork adapter 使用.

交付物:

- 文档包含明确阶段计划.
- 文档包含 license/vendor 注意事项.

## 阶段 1.5: Routing Config Contract

目标: 定义 TUI 与 `delegate_task` / plugin 之间的配置协议，避免 TUI 成为和执行层脱节的旁路状态。

### 核心原则

```
TUI 面板负责写配置
delegate_task/plugin 负责读配置
client.session.prompt(...) 负责带 model 执行
```

唯一 source of truth 是文件，不是 TUI 进程内存状态。

### 配置文件位置

`.opencode/mina-routing.jsonc`

原因:
- 项目级配置，跟仓库走，不污染用户全局目录。
- TUI 可以读写，和其他 `.opencode/` 配置一样。
- 后续 plugin / adapter 可以在运行时读取。
- 比 `.oc/routing.jsonc` 更接近 OpenCode 配置目录语义。
- **不是 core 原生配置**，必须由我们的 plugin/adapter 消费。

### 配置结构

```jsonc
{
  "routing": {
    "enabled": true,
    "agents": {
      "leader":    { "agent": "build",     "model": "ollama/glm-5.2:cloud" },
      "scout":     { "agent": "scout",     "model": "ollama/deepseek-v4-flash:cloud" },
      "engineer":  { "agent": "engineer",  "model": "mimo/mimo-v2.5-pro" },
      "critic":    { "agent": "critic",    "model": "ollama/glm-5.2:cloud" }
    }
  }
}
```

### TUI 责任边界

**允许做:**
- 读取配置，展示当前路由。
- 让用户选择或修改各角色模型。
- 写回 `.opencode/mina-routing.jsonc`。
- 显示 routing 是否启用。

**禁止做:**
- 创建 session、调用 `client.session.prompt(...)`（执行层的事）。
- 判断任务应该派给谁（主 agent/orchestrator 的事）。
- 在 TUI 内存中维护独立 routing 状态（旁路状态，和执行层脱节）。
- 使用 `.oc/routing.jsonc`。

### adapter/plugin 责任边界

**必须做:**
- 执行前读取 `.opencode/mina-routing.jsonc`。
- `routing.enabled === false` 时跳过路由，使用 agent 默认模型。
- 按 `subagent_type` 查找 `routing.agents[name]`，解析 `model` 为 `{ providerID, modelID }`。
- 调用 `client.session.prompt(...)` 时显式传 `model` 和 `agent`。
- `session_id` 续接模式下，优先使用 session 已有 agent/model，除非调用方显式覆盖。

**容错原则:** 配置文件不存在、解析失败、字段缺失，都 fallback 到 agent 默认模型，不中断执行。

### 执行示例

1. 用户在 TUI 把 engineer 设为 `mimo/mimo-v2.5-pro`，写入 `.opencode/mina-routing.jsonc`。
2. 主 agent 调用 `delegate_task({ subagent_type: "engineer", prompt: "Implement X" })`。
3. adapter 读取配置，找到 `routing.agents.engineer.model = "mimo/mimo-v2.5-pro"`。
4. adapter 调用 `client.session.prompt({ body: { agent: "engineer", model: { providerID: "mimo", modelID: "mimo-v2.5-pro" }, parts: [...] } })`。
5. 子 session 用 mimo-v2.5-pro 执行任务。

详细协议见: `fork/adapter/oh-my-opencode/delegate-task/routing-config.md`

### 不做的事

- 不写 TypeScript 实现。
- 不修改 TUI 代码。
- 不接入 plugin 启动链路。
- 不接入 background-agent / Atlas / boulder。

### 交付物

- `fork/adapter/oh-my-opencode/delegate-task/routing-config.md` — 完整协议文档。

---

## 阶段 3: 接入 delegate_task

目标: 在 fork-owned 路径里做一个最小 `delegate_task` 适配层, 验证我们能按任务显式指定模型并续接子 session.

不要一次性搬全部 `oh-my-opencode`.

优先做最小接口:

```ts
type DelegateTaskInput = {
  description: string
  prompt: string
  subagent_type?: string
  category?: string
  model?: string
  session_id?: string
  run_in_background?: boolean
}
```

第一阶段可以只支持:

- `subagent_type`
- `model`
- `session_id`
- `prompt`
- `description`

第一阶段可以暂不支持:

- category fallback chain
- skills 注入
- toast
- background execution
- retry hook
- task notepad
- Atlas/boulder state

建议实现位置:

- `fork/adapter/oh-my-opencode/delegate-task/`

建议文件:

- `fork/adapter/oh-my-opencode/delegate-task/README.md`
- `fork/adapter/oh-my-opencode/delegate-task/types.ts`
- `fork/adapter/oh-my-opencode/delegate-task/model.ts`
- `fork/adapter/oh-my-opencode/delegate-task/notes.md`

如果需要运行时代码, 先做纯函数和说明, 不要强接 OpenCode plugin 启动链路.

最小逻辑:

1. 解析 `"provider/model"` 字符串为 `{ providerID, modelID }`.
2. 如果有 `session_id`, 说明这是续接已有子 session.
3. 如果没有 `session_id`, 说明这是新建子任务.
4. 生成一份拟调用 `client.session.prompt(...)` 的 payload 结构.
5. 文档说明后续如何接入真实 plugin tool.

示例 payload:

```ts
{
  path: { id: sessionID },
  body: {
    agent: subagentType,
    model: { providerID, modelID },
    parts: [{ type: "text", text: prompt }],
  },
}
```

交付物:

- fork adapter 目录.
- 明确的类型定义.
- 模型字符串解析函数.
- README 说明如何从 vendor `delegate_task` 继续推进.
- 不接入 `background-agent`.
- 不接入 `Atlas` / `boulder`.

## 给执行模型的限制

执行 1-3 时请遵守:

- 不要大改架构.
- 不要接入全部插件.
- 不要改 vendor 源文件.
- 不要修改 TUI routing stash.
- 不要处理 background-agent.
- 不要处理 Atlas/boulder.
- 不要写“未来可以”式大段空话; 每个文档结论必须对应当前路径或下一步.
- 如果发现 OpenCode plugin API 需要确认, 只记录问题, 不要猜着改 core.

## Reviewer 检查标准

Reviewer 只看这些问题:

- 是否所有变更都在 fork-owned 范围.
- 是否保留 vendor license 和来源.
- 是否没有把 vendor 代码无边界复制到 core.
- `delegate_task` 第一阶段是否足够小.
- 是否支持 `model` 显式传入和 `session_id` 续接这个核心能力.
- 是否没有提前做 background/Atlas/boulder.

## 完成后汇报格式

执行模型完成后只汇报:

1. 改了哪些文件.
2. 阶段 1/2/3 各自完成了什么.
3. 哪些点没有做, 为什么.
4. 需要 reviewer 判断的问题.
