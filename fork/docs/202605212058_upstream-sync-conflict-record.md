# [202605212058]_Upstream Sync 冲突记录

## 冲突概要

日期: 2026-05-21
上游新增 commit: 97
冲突文件: 2

### 1. `AGENTS.md`

- **冲突原因**: 上游新增了 commit 风格指南（conventional commits）和 Style Guide 章节
- **解决方式**: 用 fork 版本覆盖（`git checkout --ours`）
- **根因**: 该文件是 fork-owned，上游不应修改，但上游在自己的 AGENTS.md 中新增了内容

### 2. `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

- **冲突原因**: 上游移除了大量 `export`，将多个函数/变量改为模块内部可见
- **上游移除的 export**:
  - `sessionBindingCommands`
  - `context`
  - `use()`
  - `UserMessage`
  - `ReasoningPart`
  - `TextPart`
  - `ToolPart`
  - `InlineTool`
  - `BlockTool`
  - `Diagnostics`
- **我们的 fork 依赖的**:
  - `sessionBindingCommands` — 用于 `packages/opencode-vim/src/routes/session.tsx` 的 keybind 注册
  - `context` — 作为 `SessionContext` 传入 minimal 的 session Provider
  - `use()` — 作为 `useSession()` 在 minimal 中读取 session 上下文
- **解决方式**: 手动对这 3 个符号加回 `export`

## 为什么会产生这个冲突

上游做了 API 封装变更（export → 模块内部），属于正常的代码整理。我们的 fork 直接 import 了这些符号，所以上游移除 export 后产生冲突。

## 如何避免

### 原则

1. **尽量不在 fork 包中直接 import 上游的内部函数/变量**
2. **如果必须 import，记录到本文档，每次 sync 后优先检查**

### 当前 fork 依赖上游 export 的清单

| 符号 | 来源文件 | fork 使用位置 | 用途 |
|------|---------|--------------|------|
| `sessionBindingCommands` | `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` | `packages/opencode-vim/src/routes/session.tsx` | session keybind 注册 |
| `context` | 同上 | 同上 | SessionContext Provider |
| `use()` | 同上 | 同上 | 读取 session 上下文 |

### Sync 后检查流程

1. 运行 `bash fork/update.sh`
2. 如果 `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` 有冲突：
   - 优先采用上游版本（`git checkout --theirs`）
   - 检查上述 3 个符号是否仍有 `export`
   - 如果被移除，手动加回 `export`
3. 运行 `cd packages/opencode-vim && bun typecheck` 验证

### 长期改进方向

考虑在 fork 中创建一个薄的 adapter 模块，集中 import 上游的这些符号，减少直接依赖散落在多个文件中。这样每次 sync 只需要检查一个文件。
