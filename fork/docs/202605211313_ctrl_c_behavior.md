# Ctrl+C Behavior Survey

日期: 2026-05-21
范围:

- upstream `packages/opencode/src/**`
- fork `packages/opencode-vim/**`

## 结论

原版 `opencode` 下，`Ctrl+C` 不是单一语义，而是按运行形态和焦点上下文分层处理：

- TUI 全局默认:
  - `Ctrl+C` 绑定到 `app.exit`
  - 作用是退出应用
- TUI prompt 输入框获得焦点时:
  - `Ctrl+C` 会被更具体的输入绑定覆盖为 `input_clear`
  - 实际执行命令是 `prompt.clear`
  - 作用是清空输入框，而不是退出
- TUI dialog 打开时:
  - `Ctrl+C` 关闭 dialog
- run split-footer 模式:
  - `Ctrl+C` 先清空 live prompt draft
  - 不满足清空条件时，进入两段式退出/中断流程
- 旧 readline CLI:
  - 有活跃 turn 时，`Ctrl+C` 中断当前 turn
  - 空闲时，第一次 `Ctrl+C` 提示，第二次 `Ctrl+C` 才退出

这意味着 upstream 对 `Ctrl+C` 的核心原则不是“立刻退出”，而是：

- 优先处理当前焦点最局部、最可逆的动作
- 只有在没有更局部语义时，才走退出
- 对中断/退出尽量采用双击确认，而不是单击即 destructive

## Upstream 细节

### 1. TUI 默认全局退出

源码:

- `packages/opencode/src/cli/cmd/tui/config/keybind.ts`

关键定义:

- `app_exit: "ctrl+c,ctrl+d,<leader>q"`

对应命令:

- `app.exit`

执行位置:

- `packages/opencode/src/cli/cmd/tui/app.tsx`

行为:

- 执行 `exit()`

说明:

- 这是最外层 fallback 语义，不代表所有上下文都应该直接退出。

### 2. TUI 输入框聚焦时，Ctrl+C 清空输入

源码:

- `packages/opencode/src/cli/cmd/tui/config/keybind.ts`

关键定义:

- `input_clear: "ctrl+c"`

命令映射:

- `input_clear: "prompt.clear"`

执行位置:

- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

行为:

- 目标是 prompt input
- 仅在输入非空时启用
- 触发 `prompt.clear`

因此 upstream 在 prompt 聚焦场景下，`Ctrl+C` 的真实语义是：

- 清空输入框

不是：

- 退出 app

### 3. TUI dialog 打开时，Ctrl+C 关闭 dialog

源码:

- `packages/opencode/src/cli/cmd/tui/ui/dialog.tsx`

行为:

- `Ctrl+C` 与 `Escape` 同义
- 都会关闭当前 dialog 并 refocus

这进一步说明 upstream 把 `Ctrl+C` 视作“当前上下文的取消/关闭动作”。

### 4. TUI session interrupt 不是 Ctrl+C，而是 Escape

源码:

- `packages/opencode/src/cli/cmd/tui/config/keybind.ts`
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

关键定义:

- `session_interrupt: "escape"`

行为:

- 运行中第一次按下只 arm interrupt
- 5 秒内再次触发才真正 abort session

这是一种两段式 destructive action。

### 5. run split-footer 模式对 Ctrl+C 更保守

源码:

- `packages/opencode/src/cli/cmd/run/runtime.lifecycle.ts`
- `packages/opencode/src/cli/cmd/run/footer.ts`
- `packages/opencode/src/cli/cmd/run/runtime.boot.ts`

关键点:

- 注释明确写着:
  - `Ctrl-c clears a live prompt draft first`
  - 否则再走退出逻辑
- `runtime.boot.ts` 里:
  - `inputClear: [{ key: "ctrl+c" }]`
  - `interrupt: [{ key: "escape" }]`
- `runtime.lifecycle.ts` 将 `SIGINT` 接到 `footer.requestExit()`
- `footer.ts` 的 exit / interrupt 都是双击确认流

因此 run 模式也不是“`Ctrl+C` 单击立即退出”。

### 6. 旧 readline CLI 同样不是单击退出

源码:

- `packages/opencode/src/cli/cmd/cli.ts`

行为:

- active turn 时:
  - `Ctrl+C` abort 当前 session turn
- idle 时:
  - 第一次 `Ctrl+C` 提示 `(Press Ctrl+C again to exit)`
  - 500ms 内第二次才退出

## 对 fork minimal 的含义

当前 minimal 的 `Ctrl+C` 如果直接退出，会和 upstream 的交互原则明显不一致。

至少从 upstream 行为来看，minimal 更合理的优先级应该是：

1. dialog 打开时:
   - `Ctrl+C` 关闭 dialog
2. prompt textarea 聚焦且有内容时:
   - `Ctrl+C` 清空输入
3. session 正在运行且进入“中断语义”上下文时:
   - 走两段式 interrupt，而不是直接退出
4. 只有在没有更局部语义时:
   - 才允许 `Ctrl+C` 走 app exit

## 当前 fork 状态

已确认的 fork 代码：

- `packages/opencode-vim/src/component/prompt.tsx`
  - 已经有 `prompt.clear`
  - 已经有 `session.interrupt`
  - prompt clear 绑定仍然来自 `tuiConfig.keybinds.get("prompt.clear")`

这说明 minimal 并不是完全缺少“局部 Ctrl+C 语义”的代码结构。

但从用户现象看：

- `Ctrl+C` 当前直接退出

更可能的偏差点有两个：

### 偏差点 A: 全局 `app.exit` 抢在局部 prompt binding 前命中

upstream 默认全局有:

- `app_exit: "ctrl+c,ctrl+d,<leader>q"`

如果 minimal 当前焦点/target routing 与 upstream 不一致，就可能导致：

- 本应落到 `prompt.clear` 的 `Ctrl+C`
- 被全局 `app.exit` 先吃掉

### 偏差点 B: 当前并不总在 prompt focus 上下文

minimal 新增了 vim normal mode、copy mode、顶部状态栏等 fork 行为后，很多时刻输入框并不聚焦。

这时如果没有做“上下文取消优先级”处理，就会退化成：

- `Ctrl+C` 直接走 app exit

## 建议

如果要把 minimal 修回与 upstream 一致的交互方向，建议按下面顺序处理：

1. 明确 `Ctrl+C` 的上下文优先级
2. 先保证 dialog / prompt clear / interrupt 比 app exit 更高优先级
3. app exit 保留为最后 fallback
4. 对 interrupt / exit 尽量保持双击确认，而不是单击 destructive

## 当前 minimal 处理策略

截至本次修复，minimal session 中的 `Ctrl+C` 采用如下顺序：

1. 如果 prompt 有草稿:
   - 清空草稿
   - 切回 insert
   - 聚焦 prompt
2. 如果 session 正在运行:
   - 复用 prompt 的 interrupt 逻辑
   - 保持现有两段式 interrupt 语义
3. 如果当前处于 vim normal mode:
   - 切回 insert
   - 聚焦 prompt
4. 以上都不命中时:
   - 允许回落到上层全局 `app.exit`

这个策略不是逐字节照搬 upstream TUI，而是：

- 保留 upstream 的“局部上下文优先于退出”原则
- 对 minimal 特有的 vim normal mode 做适配
- 避免 normal mode 下 `Ctrl+C` 因为 prompt 失焦而直接退出

## 关键源码索引

- TUI 全局退出:
  - `packages/opencode/src/cli/cmd/tui/config/keybind.ts`
  - `packages/opencode/src/cli/cmd/tui/app.tsx`
- TUI 输入清空:
  - `packages/opencode/src/cli/cmd/tui/config/keybind.ts`
  - `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- TUI dialog 关闭:
  - `packages/opencode/src/cli/cmd/tui/ui/dialog.tsx`
- TUI session interrupt:
  - `packages/opencode/src/cli/cmd/tui/config/keybind.ts`
  - `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- run split-footer:
  - `packages/opencode/src/cli/cmd/run/runtime.boot.ts`
  - `packages/opencode/src/cli/cmd/run/runtime.lifecycle.ts`
  - `packages/opencode/src/cli/cmd/run/footer.ts`
- 旧 CLI:
  - `packages/opencode/src/cli/cmd/cli.ts`
