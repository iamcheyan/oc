# opencode-vim `ocv` Branch Summary
https://github.com/samiralibabic/opencode-session-navigation

- Repo: `XPhyro/opencode-vim`
- Branch: `ocv`
- Default branch in that fork is already `ocv`

This note summarizes how that fork implements vim behavior in the TUI, and which parts are reusable for our fork.

## High-level conclusion

`ocv` does **not** solve vim navigation by putting a single global “current line” overlay on top of the whole session.

Instead, it does three separate things:

1. Builds a real vim input state machine
2. Introduces a dedicated `copy` mode for session browsing
3. Builds a line model from the rendered session tree, then injects local overlays into each message part

That design choice is the key difference from the lighter “add `j/k/gg/G` to scrollbox” approach.

## Relevant files

### Vim state / handler

- `packages/opencode/src/cli/cmd/tui/component/vim/index.ts`
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-state.ts`
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-handler.ts`
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-scroll.ts`
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-motion-jump.ts`
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-motions.ts`
- `packages/opencode/src/cli/cmd/tui/component/vim/vim-indicator.ts`

### Prompt integration

- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

### Session browsing / line model

- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/session/copy-mode.ts`

### Tests

- `packages/opencode/test/cli/tui/vim-motions.test.ts`
- `packages/opencode/test/cli/tui/vim-indicator.test.ts`

## How it works

## 1. Vim is a real subsystem, not a boolean flag

In `vim-state.ts`, `ocv` stores a full state machine:

- modes:
  - `normal`
  - `insert`
  - `replace`
  - `visual`
  - `visual-line`
  - `copy`
- pending operators:
  - `g`
  - `d`
  - `c`
  - `y`
  - `z`
  - `f/F/t/T`
  - etc.
- registers
- last-find
- repeat command
- undo/redo snapshots
- replace state
- visual anchor

So this is much closer to a small vim engine than to a simple modal toggle.

## 2. Prompt owns dispatch, but delegates session browsing

In `component/prompt/index.tsx`, the fork creates:

- `createVimState(...)`
- `createVimHandler(...)`
- `useVimIndicator(...)`

The important design is that `createVimHandler(...)` receives callbacks instead of hardcoding everything:

- `submit`
- `scroll(action)`
- `jump(action)`
- `navigate(action)`
- `copy(...)`
- `copyJump(...)`
- `copyWordNext(...)`
- `copyWordPrev(...)`
- `copyWordEnd(...)`
- `copyNextParagraph(...)`
- `copyPreviousParagraph(...)`
- `snapshot / restore`
- register access

That means:

- prompt-local editing motions stay in the prompt
- session scrolling uses session commands
- row-accurate session browsing uses copy mode

This separation is one reason the implementation stays coherent.

## 3. Session row navigation is implemented as `copy mode`

This is the most important part.

The fork does **not** treat the normal session view as a directly editable or directly row-addressable buffer.

Instead, it introduces a dedicated mode:

- `copy`

When entering copy mode:

- the session becomes navigable row-by-row
- visual selection and yank operate on session rows
- jump and word motions can target rendered session content

When leaving copy mode:

- control returns to prompt/session normal flow

This is architecturally cleaner than trying to bolt row semantics directly onto every existing session component.

## 4. It builds a real row model from rendered output

The core logic is in `routes/session/copy-mode.ts`.

It defines:

- `CopyRow`
- `CopyHighlight`

`CopyRow` contains fields like:

- `id`
- `role`
- `kind`
- `part`
- `tool`
- `line`
- `y`
- `col`

The important part is how rows are derived:

1. Read `scroll.getChildren()`
2. Match child ids back to session parts
3. Walk renderable trees under those children
4. Use renderable data such as:
   - `plainText`
   - `lineInfo`
   - `lineSources`
   - `lineWraps`
   - `lineStartCols`
   - `lineWidthCols`
5. Reconstruct actual rendered rows, including wrapped rows

This is the crucial step that makes “current line” meaningful.

They are not guessing based on message indices.
They are extracting the real display rows from the TUI render tree.

## 5. Current-line highlighting is local, not global

The visible overlay logic is in `routes/session/index.tsx`, in `CopyOverlay(...)`.

It renders three separate things:

- current line background
- visual/yank highlight spans
- block cursor

For the non-visual current row it does:

- a `box`
- `position="absolute"`
- `height={1}`
- `width="100%"`
- a very low-alpha background

But the key is:

- this overlay is inserted **inside each message part container**
- not at the top of the whole session page

Examples:

- `UserMessage` renders `CopyOverlay`
- `TextPart` renders `CopyOverlay`
- `ToolPart` renders `CopyOverlay`

Because the overlay lives in the same local render context as the text it decorates, it avoids the failure mode we hit with a global page overlay:

- behind content: hidden
- in front of content: tints all text unexpectedly

`ocv` sidesteps that by targeting each part locally.

## Why this approach works

It works because `ocv` adds the missing abstraction layer:

- a dedicated browsing mode
- a real row model
- local overlays attached to the corresponding render subtree

Without that row model, “current line” is not precise.
Without local overlays, full-session overlays fight with independent markdown/code renderers.

## What can be directly reused in our fork

These ideas are reusable with relatively low conceptual risk.

### 1. Split prompt editing from session row browsing

This is the most important reusable idea.

Instead of trying to make one mode do everything:

- prompt editing
- session scrolling
- session row cursor
- selection/yank

`ocv` uses a dedicated `copy` mode for the session.

That separation can be applied in our fork even if we do not port their whole implementation.

### 2. Use a vim handler with callbacks

Their `createVimHandler(...)` is a good architectural pattern:

- centralize key interpretation
- delegate concrete effects via callbacks

This is directly reusable as a design approach.

Even if our first implementation is smaller, this separation is worth copying.

### 3. Build a row model from renderables, not from messages

This is directly relevant to our “current line” problem.

The correct unit is not:

- message index

The correct unit is:

- rendered row

If we want true cursorline behavior, some form of `CopyRow`-like model is required.

### 4. Attach overlay inside part containers

This is also directly reusable in principle.

If we want background/cursor overlays without corrupting text appearance, the overlay should be placed:

- inside `UserMessage`
- inside text part containers
- inside tool output containers

not once globally over the entire session.

## What cannot be directly reused

These parts are not plug-and-play for our current fork.

### 1. File paths and component structure

`ocv` modifies upstream TUI files under:

- `packages/opencode/src/cli/cmd/tui/**`

Our current work is in:

- `packages/opencode-vim/**`

So their code cannot simply be copied over.
The architecture and component boundaries are different.

### 2. Their implementation depends on upstream session component structure

Their copy mode assumes:

- certain `id` conventions such as `text-${part.id}` / `tool-${part.id}`
- particular renderable shapes
- particular message/part layout structure

Our minimal session tree is much thinner and different.
The extraction logic would need adaptation.

### 3. Their vim system is much broader than our current scope

They support:

- insert/normal/replace/visual/visual-line/copy
- repeat
- registers
- undo/redo snapshots
- find motions
- operator-pending behavior
- copy-mode-specific word/paragraph/bracket motions

If we only want:

- session line cursor
- current line highlight
- mouse-to-row
- `j/k/ctrl+d/ctrl+u/gg/G`

then porting the whole subsystem would be too heavy.

### 4. Their copy mode intentionally omits some things during row extraction

For example, row building filters certain parts depending on current visibility settings.
That behavior is intentional, but it means their line model is coupled to their exact UI rules.

We would need to decide our own rules for:

- reasoning visibility
- tool detail visibility
- permission/question blocks
- todo/sub-agent rows

## Recommended reusable subset

If we want the maximum value with limited fork complexity, the most reusable subset is:

1. Introduce a dedicated session browsing mode
2. Build a `CopyRow`-style row model for minimal session
3. Keep prompt vim logic and session row logic separate
4. Render current-line overlays locally inside the row/part container

This subset captures the core insight from `ocv` without requiring a full port of their vim engine.

## Practical implication for our current problem

The `ocv` branch confirms that our earlier global-overlay idea is the wrong abstraction.

The reliable route is:

- derive real rows
- map cursor to rows
- render overlays locally where the row actually lives

That does not mean we must port all of `ocv`.
But it does mean the architectural direction is now much clearer.

要用了它的实现思路和一小部分结构化代码模式，不是整文件原样拷贝。

  这次实际借用的部分是：

  1. copy mode 这个架构
  来源思路：

  - packages/opencode/src/cli/cmd/tui/routes/session/copy-mode.ts

  我借了这些核心设计：

  - 单独做 session 浏览模式，而不是把 prompt normal mode 直接当行浏览器
  - 用 CopyRow 作为“真实显示行”的单位
  - 当前行状态用：
      - active
      - idx
      - col
      - stick
  - 提供动作接口：
      - enter
      - exit
      - move
      - jump
      - clamp
      - setFromY

  我在我们仓库里落成了：

  - packages/opencode-vim/src/feature/copy-mode.ts

  2. 从 render tree 提取真实行
  来源思路同样是 ocv 的 copy-mode.ts

  我借了它这部分方法论：

  - 遍历 render tree，而不是按 message index 硬猜
  - 读取 renderable 的：
      - plainText
      - lineInfo
      - lineSources
      - lineWraps
      - lineStartCols
      - lineWidthCols
  - 处理 wrapped line
  - 计算一行的真实列偏移

  在我们这里对应的函数是：

  - findRenderables
  - sliceCols
  - copyLine
  - rowText
  - copyMin
  - rowPadded

  这些函数的结构和 ocv 很接近，但我做了适配。

  3. 局部 overlay，而不是全局 overlay
  来源思路：

  - packages/opencode/src/cli/cmd/tui/routes/session/index.tsx
  - 它里面的 CopyOverlay(...)

  我借了这个关键设计：

  - 当前行高亮不能挂在整个 session 页面顶层
  - 应该注入到具体 message / text part / tool part 的局部容器里

  所以我在我们这里做了：

  - CopyOverlay
  - 放进：
      - user message 容器
      - text part 容器
      - reasoning part 容器
      - tool part 外层

  对应文件：

  - packages/opencode-vim/src/routes/session.tsx

  4. Vim normal 模式驱动 copy mode
  来源思路：

  - ocv 的 prompt 里 createVimHandler(...) 把浏览动作路由给 copy mode

  我没有整套搬它的 vim handler，但借了这个连接思路：

  - normal 模式进入时进入 copy/browse mode
  - j/k/ctrl+d/ctrl+u/gg/G 不再直接操作假光标
  - 而是调用 copy mode 的：
      - move
      - jump
      - clamp

  对应文件：

  - packages/opencode-vim/src/feature/vim-mode.tsx

  没有直接照搬的部分
  这些我没拿：

  - 它完整的 createVimState
  - 它完整的 createVimHandler
  - visual / visual-line / yank / register / repeat / undo redo
  - paragraph / word / bracket motions
  - yank flash/highlights
  - copy mode 的全文本复制逻辑
  - prompt 侧完整 vim 编辑行为

  原因很简单：

  - 那套太大
  - 我们当前目标只是把 session 的“当前行 + 鼠标 + j/k/翻页”做对
  - 先搬最关键的 row model 和 local overlay，性价比最高

  我额外自己改的部分
  这部分不是它原样有的，是我为了适配我们 minimal 结构补的：

  - collectNodes()
      - 递归扫描节点
        minimal 的 text/tool 不像 ocv 那样扁平
  - user message 的 meta 建模
      - ocv 主要围绕 assistant parts
      - 我们这里我补了 msg.role === "user" 的行建模
  - 只在 normal 模式下响应鼠标选行
  - 保留我们 minimal 自己的 Prompt、PermissionPrompt、QuestionPrompt、SubagentFooter

  如果你要一句话版本：

  我借的是它的：

  - copy mode
  - CopyRow 行模型
  - render tree 行提取
  - local CopyOverlay

  没借的是它的：

  - 完整 vim 编辑器内核。
