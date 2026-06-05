# Leader Menu Enter 键事件泄漏 Bug 分析

## 现象描述

在 `opencode-vim` 的 Vim 模式下，当 Leader Menu **未显示** 时：

1. 按回车（Enter）**无法**将输入提交到 prompt textarea
2. 连续按两次回车，会**意外触发** Leader Menu 中的菜单项（例如打开 lazygit）

具体表现：
- 用户处于 INSERT 模式，prompt textarea 应该获得焦点
- 按一次 Enter：无反应（prompt 未提交）
- 按第二次 Enter：LazyGit 弹窗出现（说明第一次 Enter 选中了菜单的某个 group，第二次 Enter 选中了该 group 下的第一个 item）

## 涉及的文件

| 文件 | 作用 |
|------|------|
| `packages/opencode-vim/src/feature/vim-mode.tsx` | Leader Menu 的键盘事件绑定和状态管理 |
| `packages/opencode-vim/src/component/prompt.tsx` | Prompt textarea 的渲染和键盘事件处理 |

## 系统架构中存在两套独立的 "Leader Active" 状态

### 系统 1：Keymap 层的 `useLeaderActive()`

**定义位置**：`packages/opencode/src/cli/cmd/tui/keymap.tsx:239`

```typescript
export function useLeaderActive(): Accessor<boolean> {
  return useKeymapSelector((keymap: OpenTuiKeymap) =>
    keymap.getPendingSequence()[0]?.tokenName === LEADER_TOKEN
  )
}
```

- 检查 keymap 的 `getPendingSequence()` 是否包含 leader token
- 这是 **keymap 层** 的状态，由 keymap 系统管理
- 当用户按下 leader key（如 Space）时，keymap 会在 pending sequence 中记录 leader token
- **与 leader menu 的显示/隐藏无关**

### 系统 2：Vim Mode 层的 `isLeaderActive` 信号

**定义位置**：`packages/opencode-vim/src/feature/vim-mode.tsx:29`

```typescript
const [isLeaderActive, setIsLeaderActive] = createSignal(false)
```

- 这是 **vim mode 层** 的 SolidJS 响应式信号
- 由 `openLeaderMenu()` 设为 `true`，由 `closeLeaderMenu()` 设为 `false`
- **直接控制** Leader Menu 的显示/隐藏（`<Show when={isLeaderActive()}>`）

## Prompt 中的 `isLeaderActive` 合并逻辑

**修改前**（原始代码）：

```typescript
// packages/opencode-vim/src/component/prompt.tsx
const leader = useLeaderActive()  // 来自 keymap 系统
const isLeaderActive = createMemo(() => {
  if (!vimMode.isNormal()) return false
  return leader() || vimMode.isLeaderActive?.() || false
  //     ^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //     keymap层    vim mode层
})
```

**问题**：两者用 `||` 合并。当 keymap 的 pending sequence 中有 leader token 时，`leader()` 为 `true`，即使 vim mode 的 `isLeaderActive` 为 `false`（菜单未显示），prompt 仍认为 leader 菜单是激活的。

**修改后**：

```typescript
const isLeaderActive = createMemo(() => {
  if (!vimMode.isNormal()) return false
  return vimMode.isLeaderActive?.() || false
  // 只使用 vim mode 的信号
})
```

## Vim Mode 中 `spaceActive` 局部变量的同步问题

### 原始代码中的 `spaceActive`

在 `useVimSession` 和 `useVimHome` 中，原本使用局部变量 `let spaceActive = false` 来追踪 leader 菜单是否激活：

```typescript
// useVimSession 中
let spaceActive = false

const closeLeaderMenu = () => {
  spaceActive = false
  setLeaderGroup(undefined)
  setLeaderActive(false)  // 修改全局信号
  setLeaderSelectedIndex(0)
}

const openLeaderMenu = () => {
  spaceActive = true      // 修改局部变量
  setLeaderGroup(undefined)
  setLeaderActive(true)   // 修改全局信号
  setLeaderSelectedIndex(0)
}
```

**问题**：`spaceActive` 是局部变量，而 `isLeaderActive` 是全局信号。在某些代码路径中，全局信号被重置为 `false`，但局部变量可能残留为 `true`（或反之），导致状态不同步。

### 修复后的代码

删除了所有 `spaceActive` 局部变量，统一使用全局信号 `isLeaderActive()`：

```typescript
const closeLeaderMenu = () => {
  setLeaderGroup(undefined)
  setLeaderActive(false)
  setLeaderSelectedIndex(0)
}

const openLeaderMenu = () => {
  setLeaderGroup(undefined)
  setLeaderActive(true)
  setLeaderSelectedIndex(0)
}
```

所有条件判断统一改为使用 `isLeaderActive()`：

```typescript
// 修复前
if (!spaceActive || leaderGroup()) return false

// 修复后
if (!isLeaderActive() || leaderGroup()) return false
```

## 键盘事件处理流程分析

### Enter 键在 Leader Menu 中的绑定

```typescript
// vim-mode.tsx 中的 useVimSession / useVimHome
{
  key: "enter",
  when: () => isVimNormalActive() && isLeaderActive(),
  cmd: () => {
    const items = selectableItems()
    const selected = items[leaderSelectedIndex()]
    if (!selected) return true
    if ("items" in selected) {
      setLeaderGroup(selected.key)      // 进入子菜单
      setLeaderSelectedIndex(0)
    } else {
      runLeaderLeaf(selected)           // 执行菜单项
    }
    return true
  },
},
```

**触发条件**：`isVimNormalActive() && isLeaderActive()`

### Enter 键在 Prompt 中的处理

```typescript
// prompt.tsx 的 textarea onKeyDown
onKeyDown={(e: { preventDefault(): void }) => {
  if (props.disabled || isLeaderActive() || vimMode.isNormal()) {
    e.preventDefault()  // 阻止默认行为
    return
  }
}}
```

**问题**：如果 `isLeaderActive()` 为 `true`（即使菜单未显示），Enter 键事件被 `preventDefault()` 拦截，不会传递到 textarea 的 `onSubmit`。

### Enter 键绑定到 prompt focus

```typescript
// vim-mode.tsx
{
  key: "return",
  when: () => isVimNormalActive() && kv.get("minimal_vim_enter_focus_prompt", true) && !isLeaderActive(),
  cmd: () => focusPrompt(),
},
```

**注意**：这里的 "return" 绑定只在 `!isLeaderActive()` 时生效。如果 `isLeaderActive()` 为 `true`，此绑定不触发。

## 本次补充诊断：可见性与事件门控没有完全对齐

前面的修复已经把 prompt 对 Leader Active 的判断收敛到 Vim Mode 层信号，避免 keymap pending sequence 直接影响 prompt。但实际复现还说明了两个额外问题：

1. Leader Menu 的状态可以是 active，但视觉上菜单仍可能不可见。
2. 菜单项快捷键的 `when` 条件仍然过宽，导致 keymap 在菜单不应该处理输入时仍把这些 binding 视为候选。

### 问题 1：prompt 隐藏时，Leader Menu 也可能被隐藏

Leader Menu 的浮层渲染在 `Prompt` 组件内部：

```tsx
<Show when={isLeaderActive()}>
  <box position="absolute">...</box>
</Show>
```

但包含 textarea 和 leader 浮层的外层容器原本由下面的条件控制可见性：

```tsx
<box visible={!vimMode.isNormal() || !vimHidePrompt()}>
```

这意味着在 Vim Normal 模式下，如果 `minimal_vim_hide_prompt` 或配置中的 `hidePrompt` 为 `true`：

- `isLeaderActive()` 可以是 `true`
- keyboard binding 会按 leader menu 激活状态处理 Enter / 上下键 / 菜单项快捷键
- 但承载 leader menu 的 prompt 容器不可见

这就造成用户看到的是“菜单未显示”，但事件系统仍认为菜单已经激活。

### 本次修复 1：Leader Menu active 时强制显示 prompt 容器

修改 `packages/opencode-vim/src/component/prompt.tsx`：

```tsx
// 修改前
<box visible={!vimMode.isNormal() || !vimHidePrompt()}>

// 修改后
<box visible={!vimMode.isNormal() || isLeaderActive() || !vimHidePrompt()}>
```

含义：

- INSERT 模式：正常显示 prompt
- Normal 模式且未隐藏 prompt：正常显示 prompt
- Normal 模式且隐藏 prompt，但 Leader Menu active：仍显示该容器，确保菜单可见

这样可以保证“Leader Menu 能响应键盘”与“Leader Menu 对用户可见”保持一致。

### 问题 2：菜单项快捷键的 `when` 条件太宽

在 `useVimSession` 和 `useVimHome` 中，根菜单和子菜单快捷键原本这样注册：

```typescript
...menu().flatMap((group) =>
  group.items.map((entry) => ({
    key: entry.key,
    when: () => isVimNormalActive(),
    cmd: () => handleLeaderChild(group.key, entry.key),
  })),
)

...menu().map((entry) => ({
  key: entry.key,
  when: () => isVimNormalActive(),
  cmd: () => handleLeaderRoot(entry.key),
}))
```

虽然 `handleLeaderRoot()` / `handleLeaderChild()` 内部会再次检查 `isLeaderActive()`，但这属于命令执行阶段的兜底，不应该作为事件是否能命中的第一层条件。

风险是：

- 菜单不显示时，相关 key binding 仍是可达候选
- 如果 keymap 对 `cmd` 返回 `false`、pending sequence、别名映射或 Enter/return 的处理顺序有特殊行为，仍可能出现泄漏
- 这也让代码语义不清楚：菜单快捷键看起来是全局 Normal 模式快捷键，而不是 Leader Menu 专用快捷键

### 本次修复 2：把 Leader Menu 状态前移到 `when`

修改 `packages/opencode-vim/src/feature/vim-mode.tsx` 的 `useVimSession` 和 `useVimHome` 两处绑定：

```typescript
// 子菜单 leaf 快捷键：只有 leader active 且当前 group 匹配时才响应
when: () => isVimNormalActive() && isLeaderActive() && leaderGroup() === group.key

// 根菜单 group 快捷键：只有 leader active 且还未进入 group 时才响应
when: () => isVimNormalActive() && isLeaderActive() && !leaderGroup()
```

修复后的语义：

- Leader Menu 未 active：根菜单键、子菜单键都不可响应
- Leader Menu active 且在根层：只响应根 group 键
- Leader Menu active 且在某个 group 内：只响应该 group 的 leaf 键
- 普通 prompt / textarea 输入不会被这些菜单快捷键抢走

## 当前理解

这个问题不是单纯的 Enter 键名问题，而是三层状态没有完全对齐：

1. **Keymap pending sequence**：表示 keymap 看到过 leader token，但不等价于菜单可见。
2. **Vim Mode `isLeaderActive()`**：表示 fork 自己的 Leader Menu 逻辑是否激活。
3. **Prompt 容器可见性**：决定用户是否真的看得到 Leader Menu。

修复原则是：

- prompt 是否拦截 textarea 输入，只看 Vim Mode 层的 `isLeaderActive()`，不要再混入 keymap pending sequence。
- leader menu 的快捷键，必须在 `when` 阶段就确认 menu active 和当前层级。
- menu active 时，承载 menu 的 UI 必须可见，否则就是“隐藏状态机”在处理用户按键。

## 可能的残留问题

### 1. Keymap 层的 pending sequence 未正确清除

即使 `closeLeaderMenu()` 被调用，keymap 的 `getPendingSequence()` 可能仍保留 leader token。这会导致 `useLeaderActive()`（如果还在使用）返回 `true`。

**验证方法**：在 `closeLeaderMenu()` 后打印 `useLeaderActive()` 的值。

### 2. `isVimNormalActive()` 的判断逻辑

```typescript
const isVimNormalActive = () => {
  if (!isNormal()) return false
  if (!copyMode.active()) return false
  if (dialog.stack.length > 0) return false
  if (renderer.currentFocusedEditor !== null) return false
  const focused = renderer.currentFocusedRenderable
  if (focused) {
    const name = focused.constructor?.name
    if (
      name === "TextareaRenderable" ||
      name === "InputRenderable" ||
      "plainText" in focused ||
      typeof (focused as any).insertText === "function" ||
      typeof (focused as any).setText === "function"
    ) {
      return false
    }
  }
  return true
}
```

如果 prompt textarea 未获得焦点（`renderer.currentFocusedRenderable` 为 `null`），`isVimNormalActive()` 会返回 `true`，即使用户期望在 INSERT 模式。

### 3. `return` vs `enter` 键名问题

终端可能对同一个物理按键发送不同的键名：
- "enter" — 可能被 Leader Menu 绑定使用
- "return" — 可能被 prompt focus 绑定使用

需要确认终端实际发送的键名是什么，以及 keymap 系统如何映射。

### 4. Focus 状态与 Vim 模式不同步

当用户点击 textarea 时：

```typescript
onMouseDown={(r: MouseEvent) => {
  if (vimMode.isNormal()) {
    r.preventDefault()
    return  // 在 Normal 模式下阻止点击
  }
  r.target?.focus()
}}
```

如果 `vimMode.isNormal()` 为 `true` 但用户期望在 INSERT 模式，点击不会聚焦 textarea，导致 Enter 键事件被全局 keymap 拦截。

## 调试建议

1. 在 `prompt.tsx` 的 `onKeyDown` 中添加日志：
```typescript
onKeyDown={(e) => {
  console.log('prompt onKeyDown', {
    isLeaderActive: isLeaderActive(),
    isNormal: vimMode.isNormal(),
    isVimNormalActive: isVimNormalActive(),
    leaderGroup: vimMode.leaderGroup?.(),
    leaderSelectedIndex: vimMode.leaderSelectedIndex?.(),
  })
  // ...
}}
```

2. 在 vim-mode.tsx 的 "enter" 绑定中添加日志：
```typescript
cmd: () => {
  console.log('leader enter pressed', {
    isLeaderActive: isLeaderActive(),
    isVimNormalActive: isVimNormalActive(),
    items: selectableItems(),
    selectedIndex: leaderSelectedIndex(),
  })
  // ...
}}
```

3. 检查 `useLeaderActive()` 在 `closeLeaderMenu()` 调用后的返回值：
```typescript
const closeLeaderMenu = () => {
  setLeaderGroup(undefined)
  setLeaderActive(false)
  setLeaderSelectedIndex(0)
  console.log('closeLeaderMenu: useLeaderActive =', useLeaderActive())
}
```

## 修复状态

- [x] 移除 `useLeaderActive()` 对 prompt `isLeaderActive` 的影响
- [x] 删除 `spaceActive` 局部变量，统一使用全局信号
- [x] Leader Menu active 时强制显示承载菜单的 prompt 容器，避免状态 active 但菜单不可见
- [x] 根菜单和子菜单快捷键的 `when` 条件增加 `isLeaderActive()` 与 `leaderGroup()` 门控
- [ ] **待确认**：keymap 层的 pending sequence 是否在 `closeLeaderMenu()` 后正确清除
- [ ] **待确认**：终端对 Enter 键发送的实际键名（"enter" vs "return"）
- [ ] **待确认**：focus 状态与 vim 模式的同步逻辑

## 验证记录

本次修改后运行：

```bash
cd packages/opencode-vim && bun test
```

结果：通过，6 个测试全部通过。

同时运行：

```bash
cd packages/opencode-vim && bun typecheck
```

结果：未通过，但失败集中在当前包已有类型债和上游资源声明问题，例如 `autocomplete.tsx`、`simple-tool.tsx`、`copy-mode.ts`、`attention.ts` 的 audio 资源声明、`image.ts` 的 wasm 声明等，不在本次 leader menu 修改附近。
