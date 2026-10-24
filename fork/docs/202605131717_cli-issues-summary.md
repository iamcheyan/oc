> **创建时间**: 2026-05-13 17:17

# CLI 消息显示问题汇总

## 问题 1：用户输入和 AI 回复混在一起

### 现象
```
» who are you
I'm OpenCode, an AI assistant...
» 你好
你好！很高兴见到你！
```

用户输入和 AI 回复没有视觉区分。

### 尝试的解决方案

#### 方案 1：AI 回复前添加橙色前缀

**实现代码**（repl.ts）：
```typescript
if (part.type === "text" && part.time?.end) {
  tryHideLoading()
  const text = part.text?.trim()
  if (text) {
    // Print orange prefix before AI response
    print(S.yellow, "» ", S.reset)
    await renderText(text)
  }
  continue
}
```

**render.ts 修改**：
```typescript
export async function renderText(text: string) {
  const lines = text.split("\n")
  let isFirstLine = true
  for (const line of lines) {
    // ... 代码块处理逻辑 ...
    
    // Skip empty lines at the beginning
    if (isFirstLine && !line.trim()) {
      continue
    }
    isFirstLine = false
    println(line)
  }
}
```

### 遇到的问题

1. **换行问题**：AI 回复前面有额外的空行
   ```
   » who are you
   »
   I'm OpenCode...
   ```

2. **空行跳过逻辑不完善**：AI 回复可能以空行开头，需要正确处理

### 根本原因分析

1. `text.trim()` 移除前后空白，但 `split("\n")` 后仍可能有空字符串
2. `print` + `println` 的组合导致换行不一致
3. AI 的回复格式不确定，可能以换行符开头

### 可能的改进方案

#### 方案 A：确保前缀和第一行在同一行
```typescript
// 在 renderText 外部处理，将前缀和文本合并
const lines = text.split("\n")
if (lines.length > 0 && lines[0].trim()) {
  lines[0] = "» " + lines[0]
}
// 然后输出所有行
```

#### 方案 B：使用不同的前缀样式
```
[You] » who are you
[AI]  » I'm OpenCode...
```

#### 方案 C：消息框样式
```
┌ You ─────────────────────────┐
│ who are you                  │
└──────────────────────────────┘
┌ Assistant ───────────────────┐
│ I'm OpenCode...              │
└──────────────────────────────┘
```

### 当前状态
- 代码已修改但未完全解决问题
- 需要进一步调试空行处理逻辑
- 建议暂时回滚或寻找替代方案

## 问题 2：程序启动时输入无反应

### 现象
程序刚启动时，前几次输入按回车后直接出现新的提示符，没有任何响应（不显示 "Thinking"），直到第三次左右才正常工作。

### 根本原因
**`flushBuffer` 中的多行处理逻辑**：
```typescript
if (nonEmptyLines > 1) {
  // Multi-line paste: show placeholder in input box
  if (processing) {
    pendingPasteText = text
  } else {
    showPastePlaceholder(text)  // ← 只显示占位符，不处理！
  }
}
```

当输入被识别为多行时：
1. 调用 `showPastePlaceholder` 在输入框显示 `[Pasted #1 +2 lines]`
2. **不推入 `inputQueue`，不调用 `processQueue()`**
3. 用户以为程序没反应，实际上在等待再次按回车确认

### 修复方案
在 `showPastePlaceholder` 后立即处理：
```typescript
if (nonEmptyLines > 1) {
  if (processing) {
    pendingPasteText = text
  } else {
    showPastePlaceholder(text)
    // Process immediately after showing placeholder
    inputQueue.push(text)
    processQueue()
  }
}
```

### 状态
✅ 已修复并提交

## 问题 3：粘贴占位符重复显示

### 现象
用户粘贴内容后，发送时显示两行：
```
» 测试[Pasted #1 +18 lines]
» 测试 实际粘贴的内容
```

### 根本原因
1. readline 的 `line` 事件触发时，已经打印了包含占位符的输入
2. 替换占位符后再次打印，导致重复

### 修复方案
使用 ANSI 转义码清除已打印的行：
```typescript
rl.on("line", (line: string) => {
  if (pasteMap.size > 0 && line.includes("[Pasted #")) {
    const expandedLine = replacePlaceholders(line)
    
    // 计算占用的行数（考虑终端宽度换行）
    const terminalWidth = process.stderr.columns || 80
    const linesOccupied = Math.ceil((2 + line.length) / terminalWidth)
    
    // 上移并清除所有行
    for (let i = 0; i < linesOccupied; i++) {
      process.stderr.write("\x1b[1A\x1b[2K")
    }
    
    // 重新打印替换后的内容
    process.stderr.write(S.cyan + "» " + S.reset + expandedLine + "\n")
    
    // 直接处理，不经过 flushBuffer
    pasteMap.clear()
    inputQueue.push(expandedLine)
    processQueue()
    return
  }
  // ...
})
```

### 状态
✅ 已修复并提交

## 问题 4：/bedrock-test 命令报错 ENOENT

### 现象
```
Bedrock test failed: ENOENT: no such file or directory, open '/home/csai/.config/opencode/config.json'
```

### 根本原因
`sanitizeLegacyBedrockConfig()` 函数读取配置文件时，配置目录不存在。

### 修复方案
在读取前确保目录存在：
```typescript
function sanitizeLegacyBedrockConfig(): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const configDir = Global.Path.config
    // Ensure config directory exists
    yield* Effect.promise(() => fs.mkdir(configDir, { recursive: true }))
      .pipe(Effect.catch(() => Effect.void))
    
    const file = path.join(configDir, "config.json")
    // ...
  })
}
```

### 状态
✅ 已修复并提交

## 问题 5：Ctrl+C 中断后 Agent 继续发送消息

### 现象
按 Ctrl+C 显示 "Interrupted" 后，Agent 仍然继续发送回复。

### 根本原因
`abortController` 只中断了前端的事件消费，没有通知后端停止处理。

### 修复方案
在 SIGINT 处理中调用后端的 abort 端点：
```typescript
rl.on("SIGINT", async () => {
  if (abortController) {
    abortController.abort()
    abortController = null
    
    // Tell backend to abort
    try {
      await sdk.session.abort({ path: { id: sessionID } })
    } catch (err) {
      // Ignore errors
    }
    
    println(S.yellow, "Interrupted", S.reset)
  }
})
```

### 状态
✅ 已修复并提交

## 总结

| 问题 | 状态 | 优先级 |
|------|------|--------|
| 消息混在一起 | ⚠️ 部分修复，需继续调试 | 高 |
| 启动时输入无反应 | ✅ 已修复 | 高 |
| 粘贴占位符重复显示 | ✅ 已修复 | 中 |
| /bedrock-test ENOENT | ✅ 已修复 | 低 |
| Ctrl+C 后 Agent 继续 | ✅ 已修复 | 高 |
