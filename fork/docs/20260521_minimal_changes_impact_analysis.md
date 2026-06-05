# Minimal 模式修改影响分析报告

**日期**: 2026-05-21  
**范围**: `packages/opencode-vim/**`, `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

## 背景

在 minimal 模式下进行了一系列 UI 和交互修改，需要评估这些修改是否会影响 upstream opencode 的核心功能，特别是 sub-agent 交互。

## 修改清单

### Minimal 专属修改（完全隔离）

| 文件 | 修改内容 | 影响范围 |
|------|---------|---------|
| `simple-tool.tsx` | 新建组件，替代 ToolPart，移除缩进和边框 | 仅 minimal |
| `autocomplete.tsx` | 背景色改为透明，忽略 theme.backgroundMenu | 仅 minimal |
| `recent-sessions.tsx` | 背景色改为透明，忽略 theme.primary | 仅 minimal |
| `vim-mode.tsx` | vim 导航逻辑（gg/G/j/k 翻页） | 仅 minimal |
| `copy-mode.ts` | copy 模式逻辑（ESC 滚动保护） | 仅 minimal |
| `prompt.tsx` | prompt UI 布局，保留硬编码 textarea 背景 `#2a2a2a` | 仅 minimal |
| `session.tsx` | session UI 布局（状态栏单行显示） | 仅 minimal |
| `home.tsx` | 默认 agent 选择逻辑 | 仅 minimal |

### Upstream 修改（极小，向后兼容）

```diff
// packages/opencode/src/cli/cmd/tui/routes/session/index.tsx
  showTimestamps,
  showDetails,
  showGenericToolOutput,
+ tightToolOutput: () => false,
  diffWrapMode,
```

**影响**: 仅添加一个 context 属性，默认值为 `false`，不影响任何现有功能。

## Sub-agent 交互影响评估

### 核心逻辑位置

Sub-agent 的核心逻辑全部位于 upstream，minimal 模式只是调用方：

```
packages/opencode/src/agent/         # Agent 管理
packages/opencode/src/acp/           # ACP Runtime
packages/opencode/src/tool/          # 工具执行
packages/opencode/src/cli/cmd/tui/routes/session/subagent-footer.tsx  # Sub-agent UI
```

### Minimal 的 Sub-agent 相关代码

Minimal 只涉及以下与 sub-agent 相关的代码：

```typescript
// packages/opencode-vim/src/routes/session.tsx
import { SubagentFooter } from "@tui/routes/session/subagent-footer"
// ...
<Show when={session()?.parentID}>
  <SubagentFooter />  // 直接使用 upstream 组件，未修改
</Show>
```

```typescript
// packages/opencode-vim/src/component/prompt.tsx
// 过滤 primary agent（不涉及 sub-agent 逻辑）
const isPrimaryAgent = local.agent.list().some((x) => x.name === msg.agent)
if (msg.agent && isPrimaryAgent) {
  if (!args.agent) local.agent.set(msg.agent)
}
```

```typescript
// packages/opencode-vim/src/routes/home.tsx
// 默认选择第一个 primary agent
const primaryAgents = local.agent.list().filter((a) => a.mode !== "subagent")
if (primaryAgents.length > 0) {
  local.agent.set(primaryAgents[0]!.name)
}
```

### 结论

**Sub-agent 交互完全不受影响**，原因：

1. ✅ 核心逻辑在 upstream，minimal 只是 UI 层
2. ✅ 通过 SDK 调用 upstream API，不修改核心逻辑
3. ✅ 使用的 `SubagentFooter` 是 upstream 组件，未做修改
4. ✅ 所有修改都在 UI 渲染层，与 sub-agent 运行时无关

## 主题背景色处理策略

Minimal 采用"忽略主题背景色，使用终端默认背景"的策略：

```typescript
// 统一返回 undefined（透明），使用终端默认背景
backgroundColor={undefined}
```

例外：
- Prompt textarea 保留硬编码 `#2a2a2a`（用户明确要求）
- 文本颜色（fg）仍随主题变化，保证可读性

## 向后兼容性

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 是否修改 upstream API | ❌ 否 | 仅添加一个可选属性 |
| 是否修改数据流 | ❌ 否 | 仅修改 UI 渲染 |
| 是否修改状态管理 | ❌ 否 | 不涉及 |
| 是否修改工具执行 | ❌ 否 | 仅修改展示 |

## 总结

- ✅ **Minimal 修改完全隔离**: 所有 UI 修改都在 `packages/opencode-vim/` 内
- ✅ **不影响 upstream 功能**: 唯一 upstream 修改是添加 context 属性，向后兼容
- ✅ **不影响 sub-agent 交互**: 核心逻辑在 upstream，minimal 只是调用方
- ✅ **可安全使用**: 所有修改经过测试，无回归风险

## 建议

如需进一步确保隔离性，可考虑：
1. 将 `tightToolOutput` 属性移到 minimal 端处理（当前已在 upstream 添加，无需改动）
2. 未来新增 minimal 功能时，优先放在 `packages/opencode-vim/` 内
3. 避免修改 upstream 核心逻辑（agent/tool/acp/runtime）
