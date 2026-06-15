# [2026-05-16 01:12] REPL 模型切换功能重构记录

本文档记录了对 `opencode-repl` 中 `/model` 命令从“必须重启”到“无缝热切换”的完整重构与调优过程。

## 1. 初始状态（重构前）

**表现**：
在 REPL 中输入 `/model` 并选择新模型，或者输入 `/model provider/name` 直接指定后，程序会提示：
> "Switching model requires a restart. Please run the command below to re-enter your session..."

随后直接调用 `process.exit(0)` 强制退出。用户需要复制提供的命令手动重启 REPL 才能应用新模型。

**技术原貌**：
虽然代码中已经执行了 `args.model = model`（更新了内存中的运行时参数）以及写入全局配置，但之前的实现可能是为了极其保守地避免后端会话状态不同步，或是受限于旧版 SDK 的限制，从而选择了一刀切的退出策略。

## 2. 第一次尝试：直接去掉 `process.exit(0)`

**修改思路**：
通过审查调用链发现：
1. 用户输入经过 `processInput` 解析。
2. `turnWithOptions` 每次都会读取当前的 `args.model`。
3. 后端 `sdk.session.prompt` API 实际上支持 per-request 指定模型。

**操作**：
直接移除了 `process.exit(0)`，改为打印成功提示后直接 `return`。

**结果**：
- 直接通过 `/model provider/name` 指定的方式**成功实现热切换**。
- 但是，如果只输入 `/model` 呼出交互式选择菜单，选择完毕后，REPL 出现了**“假死”**（输入文字后按回车毫无反应，也没有 Loading 动画）。

## 3. 第二次尝试：追踪 Stdin 劫持问题

**根因分析**：
交互式菜单使用的是 `@clack/prompts`（封装在 `Effect Prompt` 内）。它在启动时会劫持 `process.stdin`（修改为 Raw Mode 截获按键），但在结束后，**没有正确归还控制权**给 REPL 的 `readline.Interface`。
具体来说，REPL 的输入流是通过一个 `pasteFilter` 管道连接的 (`process.stdin.pipe(pasteFilter)` -> `readline`)。Effect Prompt 的强行接管破坏了底层的管道监听状态。

**修改方案**：
参考项目中 `permission-ui.ts` 已经验证过的安全接管模式：
1. 引入 `suspendRepl(rl)`：在弹出菜单前，移除 REPL 原有的 `line` 事件监听器，并调用 `rl.pause()`。
2. 彻底移除 Effect Prompt，手写了一个基于原生 `keypress` 事件的模型选择器。
3. 引入 `resumeRepl()`：无论用户是确认还是取消，在 `finally` 阶段恢复 REPL 的监听状态。

## 4. 第三次尝试：解决方向键失效与 ReferenceError

在手写原生选择器时，连续踩了两个坑：

### 坑 1：上下方向键失效（完全卡死）
**现象**：重写后，菜单无法上下移动，按回车和 Esc 都无效。
**原因**：Node.js 的 `process.stdin` 默认是一个纯数据流，不会自动解析键盘的 ANSI 逃逸序列（如方向键）。必须显式调用 `readline.emitKeypressEvents(process.stdin)` 来挂载解析器。
**修复**：添加了上述调用，并配合 `process.stdin.setRawMode(true)` 成功捕获到了按键对象。

### 坑 2：`ReferenceError: readline is not defined`
**现象**：加上 `emitKeypressEvents` 后，一运行就报错崩溃。
**原因**：由于历史遗留，文件顶部的导入是 `import type * as readline from "readline"`。在 TypeScript 中，带有 `type` 关键字的依赖在编译为 JavaScript 时会被**彻底抹除**。当代码中真正需要执行 `readline.emitKeypressEvents` 时，运行时找不到 `readline` 对象。
**修复**：将 `import type` 改为标准的 `import`。

## 5. 最终状态（重构后）

现在的 `/model` 切换拥有了完美的体验：

1. **零等待热切换**：无论用什么方式切换模型，按下回车后立即生效，下一句话直接使用新模型回答，没有任何中断感。
2. **安全隔离**：交互式菜单通过 `suspendRepl` 和原生的 `keypress` 监听，在选择期间与 REPL 的管道完全隔离，不会污染后续的输入输出缓冲。
3. **视觉统一**：交互式选择界面被重构为更符合 CLI 当前极简风格的纯文本列表。

### 代码变更核心摘要：

- **`src/slash-model.ts`**:
  - 重写 `handleModelCommand`，接收 `rl: readline.Interface`。
  - 移除 Effect Prompt 依赖，改为监听 `process.stdin` 的 `keypress` 事件。
  - 引入 `suspendRepl` 和 `resumeRepl` 保障生命周期安全。
- **`src/slash.ts`**: 
  - 更新注册路由，透传 `rl` 对象。
- **`src/session.ts` & `src/git.ts`** (附带优化):
  - 优化了请求前的 Loading 显示时机，并将 `git status` 替换为速度极快的 `git diff-index`，防止因为大仓库扫描导致用户误以为 REPL 假死。
