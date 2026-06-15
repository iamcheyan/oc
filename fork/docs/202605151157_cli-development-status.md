> **最后更新**: 2026-05-15 11:57

# CLI 开发工作文档

## 当前工作状态

### 已完成的改动

#### 1. AI 回复前缀显示
**文件**: `packages/opencode-repl/src/repl.ts`, `packages/opencode-repl/src/render.ts`

**改动**:
- `renderText()` 函数添加 `prefix` 参数，用于在第一行前添加前缀
- AI 回复时传递黄色 `» ` 前缀，与用户输入前缀一致
- 修复了前缀和文本不在同一行的问题

**代码**:
```typescript
// repl.ts
if (part.type === "text" && part.time?.end) {
  tryHideLoading()
  const text = part.text?.trim()
  if (text) {
    await renderText(text, S.yellow + "» " + S.reset)
  }
  continue
}

// render.ts
export async function renderText(text: string, prefix?: string) {
  const lines = text.split("\n")
  let isFirstLine = true
  for (const line of lines) {
    // ... 代码块处理逻辑 ...
    
    // Print prefix before first non-empty line
    if (isFirstLine && prefix) {
      print(prefix)
    }
    isFirstLine = false
    println(line)
  }
}
```

#### 2. Agent 思考期间禁用用户输入
**文件**: `packages/opencode-repl/src/repl.ts`

**改动**:
- `processQueue()` 中设置 `processing = true` 时暂停 readline
- Agent 工作完成后恢复 readline
- Ctrl+C 中断后也恢复 readline

**代码**:
```typescript
const processQueue = async () => {
  if (processing) return
  processing = true

  // Pause readline input during processing
  if (rl) rl.pause()

  try {
    while (inputQueue.length > 0) {
      const text = inputQueue.shift()!
      await processInput(text)
    }
  } catch (err) {
    console.error("Error processing input:", err)
  } finally {
    processing = false
    if (rl) rl.resume()
    // ... prompt logic
  }
}
```

#### 3. 权限请求处理改为内联回复
**文件**: `packages/opencode-repl/src/repl.ts`

**改动**:
- 添加模块级别变量 `pendingPermission` 跟踪待处理权限
- 权限请求时显示提示，不阻塞事件循环
- 用户在普通 prompt 输入 1/2/3 回复权限请求
- 删除原来的 `askPermissionInteractive` 函数

**代码**:
```typescript
// 模块级别变量
let pendingPermission: { id: string; permission: string; patterns: string[] } | null = null

// 事件处理 - 显示提示但不阻塞
if (event.type === "permission.asked") {
  // ... 权限记录和提示显示 ...
  pendingPermission = { id: permission.id, permission: permission.permission, patterns: permission.patterns || [] }
  // 显示提示信息...
}

// 输入处理 - 检测权限回复
const processInput = async (input: string) => {
  // Check if this is a permission reply (1/2/3)
  if (pendingPermission) {
    const trimmed = processedInput.trim()
    if (trimmed === "1" || trimmed === "2" || trimmed === "3") {
      const reply = trimmed === "1" ? "once" : trimmed === "2" ? "always" : "reject"
      const permId = pendingPermission.id
      pendingPermission = null
      await sdk.permission.reply({ requestID: permId, reply: reply })
      return
    }
    pendingPermission = null
  }
  // ... 正常处理 ...
}
```

#### 4. 输入缓冲区清理
**文件**: `packages/opencode-repl/src/repl.ts`

**改动**:
- 添加 `clearInputLine()` 辅助函数
- 每次显示 prompt 前清除当前行
- 防止残留输入字符显示在 prompt 前

**代码**:
```typescript
function clearInputLine() {
  if (!process.stderr.isTTY) return
  readline.cursorTo(process.stderr, 0)
  readline.clearLine(process.stderr, 0)
}
```

### 已知问题

#### 问题：输入卡死
**状态**: 🔴 待修复

**现象**: 某些情况下 CLI 卡死，无法输入

**可能原因**:
1. `processInput` 抛出异常导致 `rl` 无法恢复
2. 异常处理不完善导致状态不一致
3. 权限处理和主 readline 状态冲突

**尝试过的修复**:
- 添加 try-finally 确保 `processing` 和 `rl` 状态恢复
- 但问题可能更深层

### 待办事项

1. **修复输入卡死问题** - 优先级：高
   - 需要彻底审查异步流程和状态管理
   - 考虑简化权限处理逻辑
   - 可能需要添加更多调试日志

2. **测试所有场景**:
   - 正常对话流程
   - 权限请求和回复
   - Ctrl+C 中断
   - 粘贴多行文本
   - 快速连续输入

3. **代码优化**:
   - 简化复杂的状态管理
   - 添加更多注释
   - 考虑将大函数拆分为小函数

### 文件变更汇总

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/opencode-repl/src/repl.ts` | 大幅修改 | 核心 REPL 逻辑、权限处理、状态管理 |
| `packages/opencode-repl/src/render.ts` | 小幅修改 | `renderText` 函数添加 prefix 参数 |

### 开发分支

**分支名**: `feat/cli-image-support`

### 相关提交

- CLI 消息显示优化
- Agent 思考期间禁用输入
- 权限请求改为内联回复
- 输入缓冲区清理

---

**最后更新**: 2026-05-13
**作者**: OpenCode
