# [202605192230] Minimal Upstream Conflict Reduction & Script Fixes

## Why

每次 `fork/update.sh` 合并上游时都会因为 `.github/TEAM_MEMBERS` 产生 modify/delete 冲突，导致脚本失败。同时上游 `packages/opencode/src/cli/cmd/tui/context/minimal.ts` 是一个 fork 专属文件，增加了不必要的冲突面。

## What Changed

### 1. `fork/update.sh` — 修复合并冲突处理

**问题**: 脚本在 `git merge` 失败后设置 `merge_failed=true`，即使自动解决了所有冲突，仍然会 `exit 1`。

**修复**:
- 添加 `pre_merge_remove_github()` 函数，在合并前删除 `.github/` 目录，从根源避免 modify/delete 冲突
- 简化合并后的自动解决逻辑（不再需要处理 `.github/` 冲突）
- 添加冲突解决后重新检查 `git ls-files --unmerged` 的逻辑，如果所有冲突已解决则重置 `merge_failed` 标志

### 2. `packages/opencode/src/cli/cmd/tui/context/minimal.ts` — 移除上游 fork 文件

**之前**: 在上游代码中创建了 `minimal.ts`，包含 `isMinimalTuiEnabled()`、`minimalTuiScreenMode()` 等函数。

**之后**:
- 删除 `packages/opencode/src/cli/cmd/tui/context/minimal.ts`
- 在 `app.tsx` 中改为直接读取 `process.env.OPENCODE_MINIMAL_*` 环境变量
- 在 `packages/opencode-vim/src/context/minimal.ts` 中保留一份副本供 minimal 包使用

**减少的冲突面**: 上游不再有一个 fork 专属的 `.ts` 文件。

### 3. `fork/update.sh` — 跳过 models-snapshot 刷新

**问题**: 上游已删除 `packages/core/src/models-snapshot.js`，脚本中的 `update_models_snapshot()` 尝试 `git add` 不存在的文件导致报错。

**修复**: `update_models_snapshot()` 现在直接跳过，打印提示信息。

## What Stayed in Upstream (不可移动)

以下改动是 upstream 自身功能，不能移到 minimal 包：

| 文件 | 改动 | 原因 |
|------|------|------|
| `session/index.tsx` | thinkingMode 折叠功能 | upstream 自己的 thinking 功能 |
| `session/index.tsx` | 9 个 export 关键字 | minimal 复用组件必须保留 |
| `app.tsx` | `OPENCODE_TUI_ROOT_COMPONENTS` 注入 | minimal 替换 Home/Session 的核心机制 |
| `autocomplete.tsx` | reference/project 改进 | upstream 自己的功能改进 |
| `keymap.tsx` | pgup/pgdown 别名 | upstream 自己的修复 |

## Validation

```bash
bash fork/build.sh
# REPL smoke test passed
# Test harness smoke test passed
# Vim TUI smoke test passed
```

## Current Upstream Seam Summary

修改的上游文件数量从约 65 个减少到约 64 个（删除了 `minimal.ts`）。剩余的上游改动都是 upstream 自身功能，无法进一步移动。

核心冲突面：
- `app.tsx` — minimal 注入点（必须保留）
- `session/index.tsx` — export 关键字 + thinkingMode（必须保留）
- `autocomplete.tsx` — upstream 自身改动（不能移除）
