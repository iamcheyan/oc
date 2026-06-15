# [202605192250] Ctrl+C Exit Behavior Analysis

## Question

用户反馈：按 Ctrl+C 会直接退出程序，认为这样不对，担心误操作。希望与上游行为保持一致。

## Analysis

### Upstream Behavior (keybind.ts)

```
app_exit: "ctrl+c,ctrl+d,<leader>q" → Exit the application
session_interrupt: "escape" → Interrupt current session
```

### app.tsx 中的保护逻辑

```js
useBindings(() => ({
    enabled: () => {
      const ok = command.matcher.get()
      if (!ok) return false
      const current = promptRef.current
      if (!current?.focused) return true       // prompt 未聚焦 → 允许退出
      return current.current.input === ""       // prompt 有文字 → 禁止退出
    },
    bindings: tuiConfig.keybinds.gather("app_exit", ["app.exit"]),
  }))
```

**保护机制**：当 prompt 有输入文字时，Ctrl+C 不会退出程序。

### Minimal 行为

Minimal 的 `app.tsx` 与上游完全相同（共享同一个 App 组件）。`app_exit` 的绑定和保护逻辑没有被覆盖。

### 结论

**Ctrl+C 行为在 upstream 和 minimal 中是一致的。** 两者都有以下保护：
1. prompt 有输入文字时，Ctrl+C 不退出
2. prompt 未聚焦时，Ctrl+C 可以退出
3. 在 home 页面（无 session），Ctrl+C 退出

### 可能的场景

| 场景 | Ctrl+C 行为 | 是否正常 |
|------|------------|---------|
| Session 中，prompt 有文字 | 不退出 | 正常 |
| Session 中，prompt 空，已聚焦 | 退出 | 正常（与上游一致） |
| Session 中，prompt 未聚焦 | 退出 | 正常（与上游一致） |
| Home 页面，prompt 空 | 退出 | 正常（与上游一致） |

### 如果用户确实遇到了"按一次就退出"

可能的原因：
1. 当时在 Home 页面，prompt 是空的 → 这是正常行为
2. 按了 Ctrl+D 而不是 Ctrl+C → 两者都会退出
3. 其他 keybind 冲突

## Recommendation

Ctrl+C 行为已经与上游一致，无需修改。如果用户想要更安全的退出行为（比如添加确认对话框），可以作为新功能在 minimal 包中实现，但这不是 bug。
