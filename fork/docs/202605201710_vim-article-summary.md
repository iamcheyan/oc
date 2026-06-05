# Vim Keybindings Article Summary

Source: <https://sngeth.com/opencode/vim/typescript/solidjs/tui/2026/03/11/adding-vim-keybindings-to-opencode/>

## 结论

这篇文章实现的不是“真正的 vim 文本对象/编辑器内核”，而是一套基于 OpenCode TUI 现有键盘系统的 **modal navigation layer**：

- `insert` 模式下保留原本 prompt 输入行为
- `normal` 模式下接管部分按键，把会话区当成可滚动视图
- 通过模块级 `signal` 共享模式状态
- 通过 `useBindings()` 把 vim 按键挂到当前 session 页面

它的目标是“在不大改上游结构的前提下，增加 vim 风格滚动/切模态”，不是把整个消息区变成真正的逐行 vim buffer。

## 它是怎么实现的

### 1. 新增一个独立 feature 文件

文章把核心逻辑放在：

- `packages/opencode-vim/src/feature/vim-mode.tsx`

这个文件里主要有三部分：

- `useVimMode()`
  - 用模块级 `createSignal(false)` 保存 `isNormal`
  - 暴露 `enterNormal()` / `enterInsert()` / `isNormal()`
- `useVimSession()`
  - 在 session 页面注册 normal 模式下的按键绑定
  - 当切到 normal 时让 prompt `blur()`
- `VimModeIndicator`
  - 在界面上显示 `-- NORMAL --` 或 `-- INSERT --`

这里最关键的设计是：**不用 Context，而是用模块级 signal 做全局共享状态**。这样 `prompt.tsx` 和 `session.tsx` 都能拿到同一个模式值。

### 2. 在 session 路由里注册 normal 模式绑定

文章把 session 级别的滚动逻辑接在：

- `packages/opencode-vim/src/routes/session.tsx`

大致做法：

- 拿到 `scrollbox ref`
- 拿到 `prompt ref`
- 调用 `useVimSession(() => scroll, () => prompt)`
- 在页面底部渲染 `VimModeIndicator`

normal 模式下绑定的按键包括：

- `j` / `k`: 上下滚动一行
- `gg`: 跳到顶部
- `G`: 跳到底部
- `ctrl+d` / `ctrl+u`: 半页滚动
- `/` / `:`: 切回 insert 并聚焦输入框
- `escape`: no-op，用来压掉默认的 `session.interrupt`

也就是说，它不是把按键送给输入框，而是 **在 session 容器层直接消费键盘事件**。

### 3. 在 prompt 里拦截 ESC 切到 normal

文章还改了：

- `packages/opencode-vim/src/component/prompt.tsx`

这里单独加了一层 `useBindings()`，目标是输入框本身：

- `target: inputTarget`
- 条件：输入框已聚焦、未 disabled、当前不在 normal、输入内容为空
- 绑定：`escape -> enterNormal()`

这个条件很重要。文章明确只在“空输入框”时用 `ESC` 退出到 normal，避免把用户正在编辑的内容无意打断。

### 4. 它依赖现有 scrollbox，而不是重写渲染

文章的核心动作全是：

- `scroll.scrollBy(...)`
- `scroll.scrollTo(...)`

也就是说，vim 层只是把 normal 模式的按键翻译成滚动命令。消息内容仍然由原有的 `markdown` / `code` / session 组件负责渲染。

这也是它为什么改动很小、容易接入，但能力也有限。

## 这个方案为什么能工作

文章本质上利用了现有系统已经提供的三样东西：

- OpenTUI 的 `useBindings()`
- 页面已有的 `scrollbox`
- prompt 的 focus / blur 控制

于是它只做了一个薄层：

1. 用 signal 保存当前模式
2. insert 模式下让输入框正常工作
3. normal 模式下把按键映射成滚动
4. 通过 `blur()` / `focus()` 在 prompt 和 session 间切换“谁接收按键”

因此它几乎不碰上游主 TUI，也不需要重做消息渲染。

## 它没有解决什么

这篇文章实现的是“vim 风格导航”，不是“vim 风格逐行渲染/光标语义”。因此它天然没有解决这些问题：

- 当前行高亮
- 真正的行光标
- 鼠标点击后按“行”定位
- markdown/code/diff 的逐行选择
- todo / permission / sub-agent 这类交互块统一纳入行模型

原因很直接：它操作的是 `scrollbox`，不是一份可逐行寻址的 buffer。

所以文章里的方案适合：

- 先做 modal navigation
- 先做 `j/k/gg/G/C-d/C-u`
- 尽量少改代码

但不适合直接扩展成“像 nvim 一样的 cursorline / 行选择系统”。

## 对我们仓库的启发

### 适合直接借鉴的点

- 把 vim 状态隔离在 `packages/opencode-vim/src/feature/vim-mode.tsx`
- 用模块级 signal 共享 `normal/insert`
- 在 `prompt.tsx` 用输入框目标层单独接 `ESC`
- 在 `session.tsx` 用页面层消费 normal 模式导航键
- 尽量不碰 `packages/opencode/src/**`

这些都符合 fork 边界，也有利于降低未来 upstream merge 冲突。

### 需要额外设计的点

如果目标升级为：

- 当前行高亮
- 鼠标点击选中某一行
- `j/k/ctrl+d/ctrl+u` 以“选中行”为基准

那文章方案不够，需要补一层真正的“行模型”。否则只能做到“滚动像 vim”，做不到“行光标像 vim”。

## 总结

文章实现的核心可以概括成一句话：

> 在 Vim TUI 里，用模块级模式状态 + session 层按键绑定 + prompt 层 ESC 退出，把现有 `scrollbox` 包装成一个带 `insert/normal` 模态的 vim 风格阅读器。

它的优点是：

- 侵入小
- 不碰上游核心
- 很快就能获得 vim 风格导航

它的边界也很清楚：

- 它控制的是“滚动”
- 不是“逐行缓冲区”
- 所以无法天然支持真正的 `cursorline`

