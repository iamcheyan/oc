> **最后更新**: 2026-05-15 11:57

# CLI 图片粘贴功能实现方案

## 概述

本文档描述如何在 opencode-repl fork 的 REPL 中增加粘贴图片的功能。

## 当前 CLI 输入实现

fork CLI (`packages/opencode-repl/src/repl.ts`) 使用 Node.js 的 `readline` 模块，配合 bracketed paste mode 来处理文本粘贴。目前已经支持：

- 多行文本粘贴
- 显示 `[Pasted #1]` 占位符
- 用户回车时替换为实际内容

## Bug 修复：粘贴文本重复显示问题

**问题描述：**
用户在输入框中输入 `看看这段代码[Pasted #1]`，发送后：
1. readline 输入框显示原始内容（含占位符）
2. 服务端返回展开后的完整内容又显示一次
3. 导致 "看看这段代码" 这部分重复

**解决方案：**

在 `turn()` 函数中发送消息前，先清除当前输入行并立即打印用户消息：

```typescript
// Clear current input line and print user message
// This ensures the user sees their message immediately, not the raw input with placeholders
process.stderr.write("\r\x1b[K") // Clear to end of line
println(S.cyan, "» ", S.reset, message)
```

同时在 `consumeUntilIdle()` 中跳过用户消息的渲染（避免从服务端返回的用户消息再次显示）：

```typescript
// Text content (only from assistant, user message already printed)
if (part.type === "text" && part.time?.end) {
  const partInfo = (event as any).properties?.info
  // Skip user messages - already printed in turn()
  if (partInfo?.role === "user") continue
  // ... render assistant message
}
```

**修复后效果：**
- 用户发送时立即看到展开后的完整消息：`» 看看这段代码这是粘贴的长文本内容...`
- 服务端返回的用户消息不再重复显示
- Assistant 的回复正常显示

## 增加图片粘贴功能的方案

### 1. 复用现有的剪贴板工具

可以直接复用 `packages/opencode/src/cli/cmd/tui/util/clipboard.ts` 中的 `read()` 函数：

```typescript
// 在 repl.ts 中导入
import * as Clipboard from "../cli/cmd/tui/util/clipboard"

// read() 返回类型：
// - { data: string, mime: string } - 图片（base64）或文本
// - undefined - 剪贴板为空
```

剪贴板工具支持跨平台读取图片：
- **macOS**: osascript 读取 PNG
- **Windows/WSL**: PowerShell + System.Windows.Forms.Clipboard
- **Linux Wayland**: wl-paste -t image/png
- **Linux X11**: xclip -selection clipboard -t image/png

### 2. 修改粘贴处理流程

当前粘贴处理流程：

1. 检测 bracketed paste (`\x1b[200~` ... `\x1b[201~`)
2. 提取粘贴内容
3. 显示 `[Pasted #N]` 占位符
4. 用户回车时替换为实际内容

需要修改为：

```typescript
// 当检测到粘贴快捷键（Ctrl+V）时，先检查剪贴板是否有图片
async function handlePaste() {
  const content = await Clipboard.read()
  
  if (!content) return
  
  if (content.mime.startsWith('image/')) {
    // 处理图片
    const imageData = content.data  // base64 编码的图片
    // 存储图片数据，显示占位符如 [Image 1]
    // 图片数据将作为 file part 随消息发送
  } else {
    // 处理文本（现有逻辑）
  }
}
```

### 3. SDK 发送图片

SDK 的 `prompt` 方法支持 `parts` 数组，可以包含 `file` 类型的 part：

```typescript
await sdk.session.prompt({
  sessionID,
  parts: [
    { type: "text", text: "用户输入的文本" },
    { type: "file", mime: "image/png", data: base64ImageData, filename: "clipboard.png" }
  ],
})
```

参考 `types.gen.ts` 中的 `PromptFileAttachment` 类型（约第 782 行）。

### 4. 具体实现步骤

#### 4.1 导入剪贴板工具

```typescript
import * as Clipboard from "../cli/cmd/tui/util/clipboard"
```

#### 4.2 添加图片粘贴状态追踪

在 `replLoop` 函数中添加：

```typescript
// 图片附件状态
const imageAttachments = new Map<number, { data: string; mime: string }>()
let imageCounter = 0
```

#### 4.3 修改粘贴检测逻辑

在 `pasteFilter` transform stream 中，当检测到粘贴开始标记时，或者添加一个专门的图片粘贴快捷键（如 Ctrl+Shift+V）。

#### 4.4 显示图片占位符

```typescript
const showImagePlaceholder = () => {
  imageCounter++
  const placeholder = `[Image ${imageCounter}]`
  imageAttachments.set(imageCounter, { data: imageData, mime: content.mime })
  rl.write(placeholder)
}
```

#### 4.5 在 processInput 中处理

```typescript
const processInput = async (input: string) => {
  // 替换文本占位符
  let processedInput = replacePlaceholders(input)
  
  // 构建 parts 数组
  const parts: any[] = [{ type: "text", text: processedInput }]
  
  // 如果有图片附件，添加 file parts
  imageAttachments.forEach((img, num) => {
    if (input.includes(`[Image ${num}]`)) {
      parts.push({
        type: "file",
        mime: img.mime,
        data: img.data,
        filename: `clipboard-${num}.png`
      })
    }
  })
  
  // 发送消息
  await sdk.session.prompt({ sessionID, parts })
  
  // 清理
  imageAttachments.clear()
}
```

### 5. 快捷键绑定

由于 `readline` 的 `line` 事件只能捕获整行输入，需要使用 `process.stdin` 的原始模式来监听 Ctrl+V：

```typescript
// 在 replLoop 中启用原始输入模式监听快捷键
if (isInteractive) {
  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'v') {
      // 触发图片粘贴检查
      handleClipboardPaste()
    }
  })
}
```

### 6. 依赖考虑

`clipboard.ts` 依赖以下工具模块：
- `../../../../util/lazy`
- `../../../../util/filesystem`
- `../../../../util/process`
- `clipboardy` npm 包

如果路径有问题，可以把 `clipboard.ts` 复制到 `packages/opencode-repl/src` 目录并调整导入路径。

## 实现要点总结

1. **复用**现有的 `Clipboard.read()` 函数读取剪贴板图片
2. **暂存**图片数据，显示 `[Image N]` 占位符在输入框
3. **提交时**将占位符替换为实际的 file part 发送给 SDK

## 相关文件

- `packages/opencode-repl/src/repl.ts` - CLI REPL 主文件
- `packages/opencode/src/cli/cmd/tui/util/clipboard.ts` - 剪贴板工具（可复用）
- `packages/sdk/js/src/v2/gen/types.gen.ts` - SDK 类型定义

## Fork Intent 注意事项

根据 `AGENTS.md` 的 Fork Intent：

- 这是一个 `opencode` fork，添加了独立的 CLI 模式
- `packages/opencode/src/**` 被视为上游代码，默认受保护
- 优先在 `packages/opencode-repl/src/` 实现 fork 特定功能
- 如果必须修改上游代码，保持最小化并明确标注

因此建议：
1. 在 `packages/opencode-repl/src/repl.ts` 中实现图片粘贴功能
2. 将 `clipboard.ts` 复制或包装到 `packages/opencode-repl/src/` 目录下
3. 避免修改 `packages/opencode/src/cli/cmd/tui/` 下的文件
