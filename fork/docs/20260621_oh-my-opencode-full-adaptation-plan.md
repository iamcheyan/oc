# oh-my-opencode 完整适配执行计划

> 日期: 2026-06-21
> 用途: 给低成本执行模型按阶段完成实现, 再交给 reviewer 检查.
> 原则: 先做最小可用执行链路, 再逐步加 background 与 Atlas/boulder.

## 当前状态

已完成:

- `oh-my-opencode` vendor 快照位于 `fork/vendor/oh-my-opencode`.
- vendor 来源和许可证说明位于 `fork/vendor/oh-my-opencode/README.vendor.md`.
- Phase 1 `delegate_task` adapter 草稿位于 `fork/adapter/oh-my-opencode/delegate-task`.
- routing config contract 草稿位于 `fork/adapter/oh-my-opencode/delegate-task/routing-config.md`.
- TUI routing 面板已暂存于 git stash `wip-tui-routing-panel`, 后续再恢复适配.

核心方向:

```text
TUI 写 .opencode/mina-routing.jsonc
plugin/delegate_task 读 .opencode/mina-routing.jsonc
client.session.prompt(...) 执行时带 agent + model
```

不要再使用 `.oc/routing.jsonc` 作为执行 source of truth.

## 全局边界

- 新增实现优先放在 `fork/adapter/oh-my-opencode/**`.
- project runtime/plugin 文件可以放 `.opencode/plugin(s)/**`, 但必须是很薄的入口.
- 不要修改 `fork/vendor/oh-my-opencode/**`, 除非 reviewer 明确要求.
- 不要修改 upstream-owned core 包.
- 不要提前把 vendor 整个插件接入 OpenCode.
- 不要重写 OpenCode session engine.
- 每个阶段完成后更新文档和汇报文件列表.

## Phase 1.5 修正: Routing 查找规则

目标: 补清楚 routing role key 和 OpenCode agent name 的查找关系.

修改文件:

- `fork/adapter/oh-my-opencode/delegate-task/routing-config.md`
- `fork/docs/20260621_oh-my-opencode-adaptation-workflow.md`

必须写入规则:

```text
给定 subagent_type:
1. 先查 routing.agents[subagent_type] 作为逻辑角色 key.
2. 找不到时, 再查 routing.agents[*].agent === subagent_type.
3. 还找不到时, fallback 到 agent 默认模型.
```

例子:

```jsonc
{
  "routing": {
    "agents": {
      "frontend": {
        "agent": "engineer",
        "model": "google/gemini-3-pro"
      }
    }
  }
}
```

- `subagent_type: "frontend"` 命中 role key.
- `subagent_type: "engineer"` 可以通过 `agent === "engineer"` fallback 命中.

验收:

- 文档明确区分 `role key` 和 `agent name`.
- 不写代码.

## Phase 2: Routing Config Reader

目标: 在 fork adapter 中实现 `.opencode/mina-routing.jsonc` 的读取、解析和模型选择.

新增建议文件:

- `fork/adapter/oh-my-opencode/delegate-task/routing.ts`
- `fork/adapter/oh-my-opencode/delegate-task/routing.test.ts` (如测试环境方便)

支持类型:

```ts
type RoutingEntry = {
  agent: string
  model?: string
}

type MinaRoutingConfig = {
  routing?: {
    enabled?: boolean
    agents?: Record<string, RoutingEntry>
  }
}
```

必须实现:

- `loadRoutingConfig(directory: string): MinaRoutingConfig`
- `resolveRoutingEntry(config: MinaRoutingConfig, subagentType?: string): RoutingEntry | undefined`
- `resolveModelForSubagent(input: { directory: string; subagentType?: string; explicitModel?: string }): ParsedModel | undefined`

读取规则:

- 配置路径: `path.join(directory, ".opencode", "mina-routing.jsonc")`
- 支持 JSONC 注释和 trailing comma.
- 可以复用本仓库已有 JSONC parser 方式; 不要手写脆弱 parser, 除非没有可用依赖.
- 文件不存在、解析失败、字段缺失都 fallback 到默认模型.

模型优先级:

```text
1. delegate_task 调用方显式传入 model
2. .opencode/mina-routing.jsonc 里匹配到的 model
3. undefined, 让 agent 使用默认模型
```

匹配规则:

```text
1. routing.agents[subagentType]
2. Object.values(routing.agents).find(entry => entry.agent === subagentType)
3. undefined
```

验收:

- 不修改 TUI.
- 不注册 plugin.
- 没有 background/Atlas/boulder.
- routing disabled 时返回 undefined.

## Phase 3: 最小 delegate_task Plugin Tool

目标: 接一个真正可用的 fork-owned `delegate_task` plugin tool.

建议入口:

- `.opencode/plugin/mina-delegate-task.ts`

或如果项目约定使用复数:

- `.opencode/plugins/mina-delegate-task.ts`

入口要薄, 主要逻辑调用:

- `fork/adapter/oh-my-opencode/delegate-task/model.ts`
- `fork/adapter/oh-my-opencode/delegate-task/routing.ts`

工具名建议:

```text
mina_delegate_task
```

不要覆盖 OpenCode 内置 `task` 或 vendor 的 `delegate_task`, 降低冲突风险.

支持参数:

```ts
{
  description: string
  prompt: string
  subagent_type: string
  model?: string
  session_id?: string
}
```

必须行为:

### 新任务

1. 用 `client.session.create({ body: { parentID: ctx.sessionID, title } })` 创建 child session.
2. 根据 explicit model 或 routing config 解析模型.
3. 调 `client.session.prompt({ path: { id: childID }, body: { agent, model?, parts } })`.
4. 拉取最后 assistant 文本并返回.
5. 返回内容必须包含 child `Session ID`, 方便续接.

### 续接任务

1. 如果有 `session_id`, 不创建新 session.
2. 对该 session 调 `client.session.prompt(...)`.
3. 默认保留原 session 的 agent/model; 如果调用方显式传 `model`, 允许覆盖.
4. 返回结果中继续显示 `Session ID`.

轮询规则:

- 可以先实现简单稳定轮询:
  - 调 `client.session.messages()`
  - 等 assistant 消息数量稳定一小段时间
  - 或参考 vendor `delegate-task/tools.ts` 的稳定轮询逻辑
- 不要接 background manager.

验收:

- 可以通过 `mina_delegate_task({ subagent_type: "engineer", prompt: "..." })` 创建子任务.
- `.opencode/mina-routing.jsonc` 中的 engineer model 会传进 `client.session.prompt`.
- 返回结果包含 `Session ID`.
- `session_id` 续接不创建新 session.

## Phase 4: TUI Routing 面板恢复并改为真实配置

目标: 恢复之前 stash 的 TUI 面板, 但把它改成 `.opencode/mina-routing.jsonc` 的配置编辑器.

操作:

1. 恢复 stash:

```bash
git stash show --name-only stash@{0}
git stash apply stash@{0}
```

2. 修改 TUI routing config 读写位置:

从:

```text
.oc/routing.jsonc
```

改为:

```text
.opencode/mina-routing.jsonc
```

3. 修改字段结构:

从旧的:

```jsonc
{
  "routing": {
    "assignments": {
      "build": "...",
      "explore": "..."
    }
  }
}
```

改为:

```jsonc
{
  "routing": {
    "enabled": true,
    "agents": {
      "leader": { "agent": "build", "model": "..." },
      "scout": { "agent": "scout", "model": "..." },
      "engineer": { "agent": "engineer", "model": "..." },
      "critic": { "agent": "critic", "model": "..." }
    }
  }
}
```

4. TUI 只负责读写配置, 不调用 `sdk.client.config.update`.

必须删除/避免:

- 不要写 root `config.json`.
- 不要调用 `sdk.client.config.update` 去写运行时合并 config.
- 不要显示只由 TUI 内存决定的 routing 状态.

验收:

- TUI 面板保存后生成 `.opencode/mina-routing.jsonc`.
- `mina_delegate_task` 读取同一个文件.
- 状态栏 `ROUTING` 显示来自 `.opencode/mina-routing.jsonc.routing.enabled`.

## Phase 5: Agent Prompt 对齐

目标: 让主 agent 知道使用 `mina_delegate_task`, 而不是只靠内置 `task`.

修改文件:

- `.opencode/agent/build.md`

加入规则:

```text
For complex implementation tasks, prefer `mina_delegate_task` when you need model-routed delegation.
Use:
- scout for exploration
- engineer for implementation
- critic for review
Resume the same worker using `session_id` when verification fails.
```

不要删除原有内置 `task` 说明; 保留 fallback.

验收:

- build prompt 明确说明什么时候用 `mina_delegate_task`.
- 明确 `session_id` 续接审查失败后的返工.

## Phase 6: 最小端到端手动验证文档

目标: 写清楚如何手动试跑, 不要求自动测试.

新增文件:

- `fork/adapter/oh-my-opencode/delegate-task/manual-check.md`

内容:

1. 创建 `.opencode/mina-routing.jsonc`.
2. 启动 opencode.
3. 让主 agent 调 `mina_delegate_task` 给 `scout`.
4. 让主 agent 调 `mina_delegate_task` 给 `engineer`.
5. 人工检查返回中是否包含 `Session ID`.
6. 用 `session_id` 发 follow-up 修正.
7. 检查 session prompt 是否使用配置模型.

验收:

- 文档足够让人手动试跑.
- 不需要 Playwright.
- 不需要 background.

## Phase 7: background-agent 适配

前置条件:

- Phase 2-6 全部完成.
- `mina_delegate_task` 前台模式可用.

目标: 支持 `run_in_background`.

可参考 vendor:

- `fork/vendor/oh-my-opencode/src/features/background-agent`
- `fork/vendor/oh-my-opencode/src/tools/background-task`

建议先实现最小版:

- `run_in_background?: boolean`
- background task registry 存在 fork adapter 路径
- 返回 `task_id` 和 `Session ID`
- 提供 `mina_background_output(task_id)` 查询结果
- 提供 `mina_background_cancel(task_id | all)` 取消

不要做:

- toast
- tmux
- Atlas/boulder

验收:

- 可以发起后台 scout.
- 主 session 可以继续工作.
- 后续能查询后台结果.

## Phase 8: Atlas / boulder 长任务机制

前置条件:

- foreground delegation 可用.
- background delegation 可用.
- TUI routing config 和 plugin 共用同一配置.

目标: 支持计划文件驱动的长期任务执行.

参考 vendor:

- `fork/vendor/oh-my-opencode/src/agents/atlas.ts`
- `fork/vendor/oh-my-opencode/src/hooks/atlas`
- `fork/vendor/oh-my-opencode/src/hooks/start-work`
- `fork/vendor/oh-my-opencode/src/features/boulder-state`

建议最小实现:

- `.mina/plans/*.md` 或 `.sisyphus/plans/*.md` 二选一; 先写文档决定.
- active state 文件记录:
  - active plan path
  - session IDs
  - completed count
- `start-work` 命令或 tool 读取计划.
- Atlas-like prompt 指示主 agent:
  - 按 checkbox 执行
  - 一项一个 delegation
  - 审查结果
  - 失败用 session_id 续接
  - 成功 mark checkbox

不要一开始复制完整 vendor Atlas hook.

验收:

- 能从 plan 文件启动.
- 能完成至少两个 checkbox.
- 中断后能根据 state 找回 plan.

## Phase 9: 收尾与 reviewer 汇报

最后统一汇报:

1. 改了哪些文件.
2. 每个 Phase 完成情况.
3. 哪些 Phase 故意没做或降级.
4. 手动验证结果.
5. 需要 reviewer 判断的问题.

## 重要提醒

- 如果需要改 upstream core, 停下并汇报原因.
- 如果要修改 vendor, 停下并汇报原因.
- 如果 TUI 保存结果和 plugin 读取结果不是同一个文件, 这是失败.
- 如果实现绕开 `client.session.prompt(... model ...)`, 这是失败.
- 如果没有 `session_id` 续接能力, Phase 3 未完成.

## Reviewer 修正任务: Phase 3 Blocker

> 追加日期: 2026-06-21
> 状态: 必须先修, 不要继续 Phase 7/8.

本轮 review 发现 Phase 3 还不能算完成. 下一轮执行模型只修以下事项, 不要扩展新功能.

### 必须修 1: tool execute context 的 sessionID

问题:

- `fork/adapter/oh-my-opencode/delegate-task/plugin.ts` 的 `execute` 只接收 `args`.
- 代码从 `PluginInput` 上取 `sessionID`.
- 但 `PluginInput` 没有 `sessionID`; 当前 session ID 在 tool `execute(args, context)` 的第二个参数中.
- 结果是新建 child session 时 `parentID` 会变成空字符串, 子任务不会挂到当前会话下.

必须修改:

```ts
async execute(args, context) {
  ...
  const createResult = await client.session.create({
    body: {
      parentID: context.sessionID,
      title: `Task: ${description}`,
    },
  })
}
```

要求:

- 使用 `@opencode-ai/plugin` 的 tool context.
- 不要从 `PluginInput` 读取 `sessionID`.
- 新任务必须使用当前 tool 调用所在 session 作为 `parentID`.
- 续接模式 `session_id` 不创建新 session, 保持当前行为.

### 必须修 2: 删除旧旁路配置

问题:

- `.oc/routing.jsonc` 仍留在工作区.
- 现在唯一 source of truth 是 `.opencode/mina-routing.jsonc`.

必须修改:

- 删除 `.oc/routing.jsonc`.
- 不要再新增 `.oc/routing.jsonc`.
- TUI 和 plugin 都必须继续读写 `.opencode/mina-routing.jsonc`.

### 必须修 3: 验证 plugin 是否能加载

需要确认:

- `.opencode/opencode.jsonc` 中的 plugin 路径能被加载.
- `mina_delegate_task` 能出现在可用 tools 中, 或至少 OpenCode 启动时没有 plugin load error.

已知判断:

- `../fork/adapter/oh-my-opencode/delegate-task/plugin.ts` 会相对 `.opencode/opencode.jsonc` 所在目录解析, 理论上可以指向仓库根下的 `fork/...`.
- 仍需实际启动或最小方式验证.

如果验证失败:

- 先记录错误.
- 不要猜着大改 core.
- 可以考虑把 plugin 薄入口移动到 `.opencode/plugins/mina-delegate-task.ts`, 再从 `fork/adapter/...` import adapter 逻辑.

### 非 blocker 但要记录

- `routing.ts` 直接 import `jsonc-parser`. lockfile 中已有, 但当前 root/package 未显式声明依赖. 暂不要求修, 只记录.
- plugin 内相对 import `./routing` / `./model` 在 Bun/file plugin loader 下大概率可用, 但需要和 plugin load 一起验证.

### 本轮不做

- 不接 background-agent.
- 不接 Atlas/boulder.
- 不改 TUI 功能.
- 不改 vendor.
- 不改 upstream core.
- 不新增其他工具.

### 修完汇报格式

只汇报:

1. `plugin.ts` 中 `execute(args, context)` 和 `parentID` 怎么改了.
2. `.oc/routing.jsonc` 是否已删除.
3. plugin load / tool 可用性验证结果.
4. 如果验证失败, 给出完整错误信息.
