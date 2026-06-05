# Vim TUI Package Plan

## Goal

Build a fork-owned "Vim TUI" that looks closer to the standalone CLI/REPL experience without repeatedly editing upstream TUI files.

The main constraint is upstream churn:

- `packages/opencode/src/cli/cmd/tui/**` will continue to change upstream.
- Directly removing banner, borders, prompt metadata, and layout details inside upstream components will create frequent merge conflicts.
- The fork should preserve the upstream default TUI path and keep fork-specific UI behavior isolated.

## Recommendation

Do **not** implement minimal mode as a long list of edits inside the existing upstream TUI components.

Instead, mirror the current `packages/opencode-repl/` strategy:

- keep a fork-owned package
- give it its own entrypoint
- let it reuse shared runtime/session/provider logic where possible
- keep fork UI composition inside the new package

Recommended package name:

- `packages/opencode-vim/`

Why not `opencode-minima`:

- `minimal` is clearer and idiomatic
- `minima` reads like a typo or an internal codename
- future commands/binaries/config keys will be easier to understand with `minimal`

Alternative acceptable names:

- `packages/opencode-tui-minimal/`
- `packages/opencode-lite/`

Preferred choice remains:

- `packages/opencode-vim/`

## High-Level Architecture

Target shape:

- upstream default TUI remains unchanged
- fork adds a new minimal-TUI package and entrypoint
- minimal package owns fork-specific layout and presentation
- only a very small bridge layer touches upstream code when necessary

This gives us two fork-owned frontends:

- `packages/opencode-repl/` for pure readline/CLI behavior
- `packages/opencode-vim/` for lightweight TUI behavior

Both can reuse the same backend/session/model/provider stack while keeping UI differences isolated.

## Why This Is Safer Than Editing Upstream TUI

If we directly edit files like:

- `packages/opencode/src/cli/cmd/tui/routes/home.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

then almost every upstream UI update risks conflict in high-churn files.
 有，而且你这个判断是对的。

  现在这条路确实是在现有 TUI 布局系统上打补丁，不是治本。

  根因不是某个 padding 或 footerHeight，而是整个 TUI 的渲染模型本来就不是“从上到下自然流式排版的 CLI”，而是：

  - 一个固定尺寸的 renderer surface
  - 上层内容区 + 下层 footer 区
  - prompt 本身也是一个组件卡片，不是一行 shell prompt
  - home/session 都是组件布局，不是 stdout 追加文本

  所以你现在看到的“浮在下面”“像卡片”“总有块感”，不是偶然，是这套架构天然产物。

  真正治本有两条路：

  1. 继续走 opencode-repl 这类真正的 CLI 渲染
     这就是最彻底的。
     特点是：

  - 不接管屏幕
  - 不走 OpenTUI surface
  - 直接 stdout 流式输出
  - readline/input 自己控制
  - 天然就是“从上到下排列”

  如果你的目标是“像 shell 一样”，这条路是最正确的。

  2. 彻底做一套新的 Vim TUI 视图，而不是复用当前 TUI prompt/home/session
     如果你还想保留 TUI 的一些能力，但视觉上要无限接近 CLI，那就不能继续沿用现在的 Home、Prompt、Session 组件。
     要做的是：

  - opencode-vim 不再只是“设置几个环境变量然后复用原 TUI”
  - 它要有自己的一套页面骨架
  - 上面是 scrollback / message list
  - 下面是一条真正简化的 input bar
  - 布局从根上就是纵向流，不再复用原来的卡片 prompt

  也就是说，真正治本的 minimal 方案应该是：

  - 复用数据层、session 层、provider 层、worker 层
  - 但重写 UI 组合层

  不是改 theme
  不是关动画
  不是缩 footer
  不是 patch 原 Prompt
  而是新建：

  - MinimalApp
  - MinimalHome
  - MinimalSession
  - MinimalPrompt

  让 opencode-vim 直接走这套组件。

  这才是“从根上消除现在这个布局”。

  所以我的明确建议是：

  如果你想要的最终效果是“就是 CLI，只是保留一点 TUI 能力”，不要再继续在当前 prompt 上修边角了。
  下一步应该切到真正的 fork-owned minimal UI 组合层，停止复用 upstream 那套 Home/Prompt/Session 的结构。

  一句话总结：

  - 现在是在旧房子里拆吊顶，确实不治本
  - 治本方案是另起一套 minimal UI 骨架，但继续复用 backend 和会话能力

  如果你同意，我下一步就不再调 footerHeight 这种补丁了，而是直接给你设计 opencode-vim 的第一版真正骨架。
If we instead move fork behavior into `packages/opencode-vim/`, the fork mostly owns:

- package structure
- entrypoint
- minimal layout components
- minimal visual defaults

and upstream merge pressure is limited to the small number of shared integration points we intentionally depend on.

## Theme And Plugin Positioning

Theme and plugin support are useful, but they should not be the primary architecture.

Use theme for:

- muting borders
- flattening panel/background contrast
- reducing visual noise
- choosing CLI-like colors

Use plugins only for:

- optional slot replacement
- experiments
- local customization

Do not rely on theme/plugin alone for the fork's core minimal mode because:

- theme changes color semantics, not layout structure
- plugins work through slots, but replacing prompt/session/home through plugins would still force us to maintain a parallel UI implementation
- plugin-driven replacement is less explicit than a fork-owned package and harder to reason about during upstream sync

Conclusion:

- `opencode-vim` should be the primary vehicle
- a bundled minimal theme can support it
- plugins can remain optional, not foundational

## Proposed Boundaries

Fork-owned:

- `packages/opencode-vim/**`
- new minimal entrypoint and package metadata
- minimal layout components
- minimal home/session/prompt composition
- minimal startup defaults

Protected upstream by default:

- `packages/opencode/src/**`

Allowed upstream touch points, only when necessary:

- add a new command/entry registration if the binary must be exposed from existing CLI plumbing
- add thin shared exports if minimal package needs access to upstream helpers
- avoid editing high-churn prompt/session rendering internals unless there is no other path

## First Iteration Scope

The first version of `opencode-vim` should aim for visual simplification, not a new feature matrix.

Phase 1 goals:

- no large character logo/banner
- no flashy startup animation
- reduced or removed decorative borders
- simpler prompt chrome
- compact model/agent/status presentation
- defaults that feel closer to terminal CLI than app UI

Phase 1 non-goals:

- rewriting session engine behavior
- replacing provider/model logic
- inventing a third command language
- reproducing every custom behavior from `opencode-repl`

## Suggested Internal Structure

Initial package structure can mirror `packages/opencode-repl/` in spirit, but remain TUI-oriented:

- `packages/opencode-vim/src/index.ts`
- `packages/opencode-vim/src/app.tsx`
- `packages/opencode-vim/src/routes/home.tsx`
- `packages/opencode-vim/src/routes/session.tsx`
- `packages/opencode-vim/src/component/prompt.tsx`
- `packages/opencode-vim/src/theme/minimal.json`

The package should favor composition over forking large upstream files line-for-line.

Preferred pattern:

- import shared context/runtime/data hooks where possible
- replace layout/presentation locally
- only copy code when the upstream component is too entangled to reuse cleanly

## Integration Strategy

Best-case integration:

- new binary or subcommand starts `opencode-vim`
- upstream default `opencode tui` remains unchanged

Fallback integration:

- a fork-only flag selects Vim TUI
- upstream path remains default

Avoid:

- changing the default upstream TUI appearance for all users
- hiding fork behavior behind a large number of conditionals inside upstream prompt/session files

## Decision

Proceed with a fork-owned package:

- `packages/opencode-vim/`

This is the cleanest continuation of the existing fork strategy and keeps upstream merge conflicts bounded.

## Next Step

Before implementation, define the smallest possible first slice:

1. package scaffold
2. entrypoint wiring
3. minimal home screen without banner
4. minimal session prompt shell
5. optional bundled minimal theme

That should be done before touching deeper shared UI internals.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• 可以，但我不建议把它当成你们现在 fork REPL 的完全替代。

  从代码上看，TUI 的“视觉复杂度”确实大部分都能改掉，不需要另起一个 REPL 才能做到：
  packages/opencode/src/cli/cmd/tui/component/logo.tsx:881 有独立 logo 组件，启动 banner/动画是可拆的。
  packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:1603 这里有明显的边框、底部分隔线、spinner、元信息行。
  packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:1640 还已经有 animations_enabled 开关。
  packages/opencode/src/cli/cmd/tui/context/theme/github.json:76 主题里有 backgroundElement、border、borderSubtle 这些语义
  色，完全可以做一套“近似纯 CLI”的 theme，把面板感压到很低。

  所以如果目标只是：

  1. 去掉启动 logo / splash
  2. 关闭 spinner 动画
  3. 弱化或移除边框、分隔线、面板背景
  4. 把底部状态区压成更朴素的一行

  那改 TUI 是可行的，而且从长期维护看通常比维护一个平行 REPL 分支更轻。

  但关键点在这里：这只能解决“看起来像 CLI”，解决不了“行为上就是 CLI”。

  你们现在 packages/opencode-repl/ 这条线拥有的是另一套交互契约，不只是另一层皮肤：
  packages/opencode-repl/src/repl.ts:1 是原生 readline/paste/filter 驱动。
  packages/opencode-repl/src/slash.ts:1 是 fork 自己的 slash command 面。
  packages/opencode-repl/src/session.ts:1 和 packages/opencode-repl/src/render.ts:322 是更偏流式文本输出的渲染逻辑。

  这意味着如果你们真正想要的是下面这些能力，单改 TUI 外观不够：

  1. 明确的一行 prompt + 纯文本滚动输出。
  2. 更接近 shell/readline 的输入行为。
  3. 自定义 slash 命令和 fork 特有状态流。
  4. 更可控的日志式输出格式，而不是组件式布局。
  5. 尽量不碰上游 TUI 大量组件树。

  我的判断是：

  如果目标是“让默认体验更简洁、少装饰、少动画”，优先改上游 TUI，成本更低。
  如果目标是“做一个真正的 CLI 模式，输入输出语义都更像 shell/REPL”，那还是保留 opencode-repl 更合理。

  更实际的路线是二选一不要太早，改成分层策略：

  1. 先把上游 TUI 做一个 minimal 或 cli-like 变体。
  2. 只把纯视觉项往上游收：logo、动画、边框、面板背景、状态区密度。
  3. 把 fork REPL 保留给真正的行为差异：readline、slash 扩展、文本渲染、权限/队列交互。
  4. 等最小化 TUI 跑一段时间后，再判断 fork REPL 是否还有不可替代的行为价值。

  这样做的好处是，先把“最容易 upstream / 最不值得分叉”的部分收回去，减少差异面；只有那些确实属于 CLI 模式本质的东西，才继续留
  在 packages/opencode-repl/。

  如果你愿意，我下一步可以直接给你列一个非常具体的拆分清单：
  “哪些改动适合进 TUI minimal theme，哪些应该继续留在 fork REPL”，按文件和风险分组。

  
• 有办法，而且这才是更合理的方向。

  你不需要在 opencode-vim 里把所有东西重写一遍。
  真正该重写的只有“页面骨架”和少量“外层容器”，不是整套交互能力。

  可以把东西拆成三层看：

  1. 数据和行为层
     这些尽量沿用 upstream：

  - session / model / provider / worker
  - prompt 提交逻辑
  - slash/命令体系
  - /model、/agent、/theme 这些 dialog 的触发逻辑
  - 权限流、问题流、toast、插件系统
  - markdown 渲染、代码高亮、消息同步

  2. 组件能力层
     这部分也尽量沿用：

  - 现有 Prompt 的输入编辑能力
  - 现有 dialog 组件
  - 现有 session message 渲染组件
  - 现有 keymap / command palette / model picker
  - 现有 provider/model 状态读取

  3. 页面布局层
     这部分才是你要 fork-owned 重写的：

  - App 的整体排布
  - Home 页结构
  - Session 页结构
  - prompt 放在什么位置
  - sidebar 是否存在
  - header/footer 是否存在
  - 哪些元信息显示在输入框上方/下方

  也就是说，完全可以做到：

  - 大布局自己改
  - 细节交互继续沿用 TUI

  这是可行的，而且比 opencode-repl 那条路轻很多。因为你不需要重新做：

  - markdown 渲染
  - syntax highlight
  - model 菜单
  - provider 菜单
  - 权限菜单
  - 输入法/粘贴/快捷键
  - TUI worker / sync / session machinery

  你真正应该做的是“重新组合”，不是“重新发明”。

  最现实的做法是：

  1. MinimalApp
     沿用 ThemeProvider、SDKProvider、SyncProvider、DialogProvider、ToastProvider 这些 context
     只改最外层布局，不改状态系统
  2. MinimalHome
     不要复用现在居中的 Home
     但仍然复用现有 Prompt
     只是把它放到底部，去掉 logo 和大块留白
  3. MinimalSession
     不要复用现在那套 sidebar + content + prompt 的页面结构
     但继续复用：

  - 现有 message list 渲染相关能力
  - 现有 Prompt
  - 现有 PermissionPrompt
  - 现有 QuestionPrompt
  - 现有 dialog 触发逻辑

  4. MinimalPromptShell
     这个很关键：
     不是重写 Prompt 的输入能力，而是给 Prompt 套一个更轻的壳，或者给 Prompt 加 minimal 变体
     把这些去掉或压缩：

  - 粗边框
  - 上下 padding
  - model/agent 大块 metadata
  - 底部帮助栏
    但输入、菜单、快捷键、提交逻辑继续复用原来的

  关键判断是：

  - /model 后面的弹出菜单，不需要你重写，只要命令和 dialog/context 还沿用 TUI，那它就还能用
  - markdown 渲染和 code 着色，不需要你重写，只要消息渲染层继续复用
  - 各种命令、palette、选择器，也都可以保留

  所以答案是：

  可以，只改大的布局，其他细节继续沿用 TUI。
  而且这正是你现在该走的路线。

  你需要避免的只有一种错误路线：
  “为了改布局，把 Prompt、Session、消息渲染、dialog 全部重新实现”
  那就会重蹈 repl 的覆辙。

  更准确地说，你现在要做的是：

  - fork 页面骨架
  - 复用交互内核
  - 最多给少数核心组件加 minimal 外观分支

  如果你愿意，我下一步可以直接给你画一个非常具体的最小重构图：
  哪些文件保留复用，哪些文件新建 minimal 版，哪些 upstream 文件只需要打一两个 seam。

• 可以，这个目标是清晰且可实现的。

  你要的不是“另写一个 REPL”，而是：

  - 启动布局像 CLI
  - 页面主结构从上到下自然流
  - 输入区像 CLI prompt
  - 但内部交互内核继续沿用 TUI

  这条路成立。

  你要的 opencode-vim 本质上应该是：

  - CLI-style shell layout
  - TUI-powered interaction engine

  也就是外观和骨架像 opencode-repl，但能力和细节仍然来自 TUI。

  最关键的设计原则

  1. 不重写数据层。
     继续沿用 TUI 的 SDKProvider、SyncProvider、LocalProvider、DialogProvider、ToastProvider、keymap、worker、session
     machinery。
  2. 不重写交互能力。
     继续沿用：

  - /model、/agent、/theme 等命令触发
  - dialog / picker / permission / question
  - markdown 渲染
  - code highlighting
  - TUI 的 prompt 输入能力
  - paste / IME / keyboard handling

  3. 只重写“外层骨架”和“启动壳”。
     也就是：

  - 启动页
  - 顶部 session/model/context 信息
  - 主消息区的排布
  - 底部输入区的布局
  - 去掉 sidebar / 居中卡片 / logo / 装饰条

  你描述的目标界面，应该拆成这几块

  1. MinimalHeader
     固定打印：

  - opencode-vim
  - Session: ...
  - Model: ...
  - Context: ...
  - Type /help ...

  这块是新的，自己做。

  2. MinimalTranscript
     中间是消息流区域。
     这里不要重新发明消息渲染，尽量复用现有 TUI session message rendering。
  3. MinimalPromptBar
     底部只保留一个极简 prompt 外壳，例如：

  - 一行 »
  - 输入框
  - 可选极小状态信息

  这里不要重写输入逻辑，应该尽量包现有 Prompt，或者给现有 Prompt 增加 minimal 外观模式。

  4. MinimalDialogs
     /model 之后的菜单、权限框、问题框、palette，继续复用现有 dialog 系统。
     这块不要碰。

  所以真正的文件策略应该是

  新建：

  - packages/opencode-vim/src/app.tsx
  - packages/opencode-vim/src/component/header.tsx
  - packages/opencode-vim/src/routes/home.tsx
  - packages/opencode-vim/src/routes/session.tsx

  尽量复用：

  - upstream Prompt
  - upstream dialog components
  - upstream sync/local/theme/sdk contexts
  - upstream message rendering pieces

  谨慎改 upstream：

  - 给 Prompt 加一个 minimal 外观分支
  - 或把 Prompt 里“输入能力”和“外观壳”拆开一点

  最重要的判断
  你不要再试图把当前 upstream Home/Session 通过几个参数硬拧成 CLI。
  那条路只会一直 patch。

  正确做法是：

  - MinimalHome 和 MinimalSession 自己写
  - 但它们内部继续调用 upstream 的能力组件

  也就是说：

  - 布局自己控
  - 能力继续借

  这和 repl 最大的区别是：
  你不是重写渲染系统，只是重写页面组合方式。

  我建议下一步直接按这个最小切片来做：

  1. MinimalHeader
     先把你要的启动头信息做出来。
  2. MinimalHome
     只显示：

  - header
  - 空白消息区
  - 底部 prompt

  3. MinimalSession
     把现有 session 页面换成：

  - header
  - transcript
  - permission/question area
  - prompt

  4. Prompt minimal mode
     把边框、padding、metadata、底部帮助栏压掉。

  如果你同意，我下一步就不再继续调现有 Home 布局了，而是正式开始做这套 MinimalHeader + MinimalHome + MinimalSession 骨架。