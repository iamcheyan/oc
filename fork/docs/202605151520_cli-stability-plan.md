# [202605151520]_CLI稳定性改造计划

## 背景

最近对 fork CLI 做了多轮交互修复，已经暴露出一类共同问题：

- thinking 动画会在用户看到任何回复前提前消失
- CLI 启动页显示的模型与实际执行模型不一致
- `agent · model` 头信息会在一轮回答中重复出现

这些问题都不是单点逻辑错误，而是 **事件流、渲染状态和运行时参数分散** 导致的回归。

## 目标

优先补强最容易反复出问题的部分，而不是继续扩大功能面：

1. 把 session 渲染规则抽成可测试的纯逻辑
2. 给 loading / assistant header / tool 输出规则补最小回归测试
3. 把 model 解析优先级抽成可测试的纯逻辑
4. 给 `--model` 实际生效逻辑补回归测试
5. 把 REPL runtime state 中的 `model` 收口成统一结构，避免 slash 命令和 prompt 发送分叉

## 规则约定

当前 CLI 交互规则明确为：

1. 只要用户还没看到可见反馈，就持续显示 loading
2. `message.updated` 只用于缓存 assistant 元信息，不能单独让 loading 消失
3. tool 输出可以先出现
4. assistant 头信息只在本轮第一次正文或 reasoning 输出前打印一次
5. tool running / completed / error 不触发 assistant 头信息
6. CLI 启动页显示的模型必须与 `session.prompt` 实际发送的模型一致
7. REPL 运行时 `model` 统一使用 `{ providerID, modelID }`，字符串只在 CLI 输入或 config 持久化边界出现

## 实施步骤

### 1. Session 可见性状态机

新增一个轻量纯逻辑模块，输入事件后输出：

- 是否隐藏 loading
- 是否记录 assistant info
- 是否打印 assistant header
- 当前事件是否属于 text / reasoning / tool 可见输出

这个模块由 `session.ts` 复用，避免规则继续散在事件循环里。

### 2. Model 解析规则

新增一个纯函数处理模型解析优先级：

1. 用户显式传入 `--model`
2. 全局 config 的 `model`
3. provider 默认模型
4. provider 第一个可用模型

`repl.ts` 只负责从 SDK 取数据，再把数据交给这个纯函数。

### 3. 最小回归测试

新增 `packages/opencode-repl/test/` 测试：

- assistant message 创建但无可见 part 时，不隐藏 loading
- tool 输出不会触发 assistant header
- 第一段正文或 reasoning 出现时，打印一次 assistant header
- assistant header 在同一轮只打印一次
- `--model` 优先于 config/default 生效
- config/default/fallback 的解析顺序符合预期

### 4. Runtime State 收口

把 REPL 内部的 `model` 状态统一成结构化对象：

- `repl.ts` 启动后持有解析完成的 model
- `/model` 和 `/bedrock-test` 都只写结构化 model
- 真正写入 config 时再格式化成 `provider/model`
- 真实发送给 `session.prompt` 的仍然是结构化 model

这样可以避免：

- 启动页显示是一个模型，slash 修改后内部又回到字符串
- 同一套状态在不同命令里重复 parse
- 后续继续出现“显示值”和“实际发送值”不一致

## 本次执行范围

本轮先完成:

- [x] 计划文档落盘
- [x] session 可见性规则抽离
- [x] model 解析规则抽离
- [x] 最小测试覆盖
- [x] README 补充 CLI 测试用法
- [x] runtime state 的 model 统一结构化
- [x] runtime model parse/format 测试
- [x] slash/runtime state 集成测试
- [x] turn/event/slash 三层交互规则说明补充

暂不做：

- 大规模重构 slash 命令状态
- render.ts 全局代码块状态重写
- CLI 历史回放渲染体系调整

## 下一阶段

在不做大规模重构的前提下，继续补一层更贴近真实交互的测试：

- slash 命令如何修改 runtime state
- runtime state 如何影响后续 prompt 发送
- 这层测试优先覆盖 `/agent`、`/thinking`、`/exit` 这类低副作用命令

这样可以在不引入复杂 TTY harness 的情况下，先守住：

- slash 改状态是否生效
- REPL 内状态是否还保持统一结构
- 后续继续改交互逻辑时，最常见的“状态改了但没传下去”问题

### turn / event / slash 三层契约

当前交互链路约定为：

1. `slash.ts`
只负责解析命令并修改 `ReplRuntimeState`，例如切换 `agent`、`model`、`thinking`。

2. `repl.ts`
读取当前 `ReplRuntimeState`，把 `agent` / `model` / `thinking` 传给下一次 `turnWithOptions()`。

3. `session.ts`
只根据实际发送后的事件流渲染 loading、assistant header、tool 输出和正文，不依赖“之前打算发送什么”。

这条契约的目标是避免：

- slash 命令修改了状态，但后续 prompt 没消费
- CLI 显示状态与真实发送参数分叉
- event 渲染继续依赖过时的本地状态推断
