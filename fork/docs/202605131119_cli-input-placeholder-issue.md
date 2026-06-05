> **创建时间**: 2026-05-13 11:19

# CLI 输入占位符显示问题

## 问题描述

在使用 fork CLI 的 REPL 模式时，当用户粘贴多行内容，系统会在输入框中显示占位符（如 `[Pasted #1 +18 lines]`）来代替实际内容。用户确认发送后，会出现**重复显示**的问题：

```
» 测试[Pasted #1 +18 lines]          ← 包含占位符的原始输入
» 测试 粘贴的实际内容                 ← 替换后的内容
```

### 根本原因

1. **readline 的 `line` 事件触发机制**：当用户按回车时，readline 会先将当前输入框内容（含占位符）打印到终端，然后才触发 `line` 事件
2. **占位符替换发生在打印之后**：我们在 `line` 事件处理器中替换占位符，但此时 readline 已经打印了包含占位符的版本
3. **无法阻止 readline 的默认行为**：Node.js 的 readline 模块没有提供阻止默认打印行为的 API

### 多行输入的复杂性

即使使用 ANSI 转义码上移一行并清除，也存在问题：
- 如果用户输入内容超过终端宽度，会自动换行到多行
- 简单的上移一行无法清除所有已打印的行
- 需要计算实际占用的行数 = `ceil((prompt宽度 + 输入长度) / 终端宽度)`

## 当前解决方案

### 方案一：ANSI 转义码修正（已尝试）

在用户按回车时，使用 ANSI 转义码清除已打印的行并重写：

```typescript
rl.on("line", (line: string) => {
  if (pasteMap.size > 0 && line.includes("[Pasted #")) {
    const expandedLine = replacePlaceholders(line)
    
    // 计算实际占用的行数
    const terminalWidth = process.stderr.columns || 80
    const promptWidth = 2 // "» "
    const linesOccupied = Math.ceil((promptWidth + line.length) / terminalWidth)
    
    // 上移并清除所有行
    for (let i = 0; i < linesOccupied; i++) {
      process.stderr.write("\x1b[1A\x1b[2K")  // 上移 + 清除行
    }
    
    // 重新打印替换后的内容
    process.stderr.write(S.cyan + "» " + S.reset + expandedLine + "\n")
    lineBuffer.push(expandedLine)
  }
})
```

**缺点**：
- 复杂度高，需要准确计算行数
- 如果终端宽度变化或存在 Unicode 宽字符，计算可能不准确
- 视觉上可能有闪烁

### 方案二：简短提示替代占位符（推荐）

不在粘贴时显示 `[Pasted #1 +18 lines]` 这样的占位符，而是显示一个简短的提示：

```typescript
const showPastePlaceholder = (originalText: string) => {
  pasteCounter++
  const lines = originalText.split("\n")
  const nonEmptyLines = lines.filter((l) => l.trim()).length
  
  // 使用简短提示而不是占位符
  const hint = nonEmptyLines > 1 
    ? `[${nonEmptyLines} lines] `
    : "[text] "
  
  pasteMap.set(pasteCounter, originalText)
  
  if (rl) {
    rl.write(hint)
  }
}
```

**优点**：
- 用户看到的是可理解的简短提示
- 不需要复杂的替换逻辑
- 按回车后直接发送，不会产生重复显示

## 其他 Agent CLI 的解决方案

### 1. Clack（Node.js 提示库）

**核心思想**：完全控制渲染，不使用 readline 的默认输出

```typescript
// 创建 readline 时不使用 prompt
this.rl = readline.createInterface({
  input: this.input,
  tabSize: 2,
  prompt: '',  // 空 prompt，不自动打印
  escapeCodeTimeout: 50,
  terminal: true,
});

// 完全手动的渲染控制
private render() {
  const frame = wrapAnsi(this._render(this) ?? '', process.stdout.columns, {
    hard: true,
    trim: false,
  });
  
  // 使用 sisteransi 库精确控制光标
  this.output.write(cursor.hide);
  this.restoreCursor();  // 恢复到上一帧位置
  this.output.write(erase.down());  // 清除下方内容
  this.output.write(frame);  // 写入新帧
}
```

**关键特性**：
- 使用 `sisteransi` 库进行精确的光标控制
- 跟踪 `_prevFrame` 计算差异，只更新变化的部分
- 完全绕过 readline 的默认行为

### 2. Ink（React for CLI）

**核心思想**：完全放弃 readline，使用自定义渲染层

```typescript
// 基于 React 的声明式 UI
const App = () => {
  const [input, setInput] = useState('');
  
  return (
    <Box>
      <Text>{input}</Text>
    </Box>
  );
};
```

**优点**：
- 声明式编程模型
- 自动处理重绘和更新
- 完全控制输出

**缺点**：
- 引入 React 运行时，体积大
- 需要重写整个 UI 层

### 3. enquirer / prompts

**核心思想**：类似 clack，但更简单

- 提交后使用 ANSI 转义码清除并重绘
- 维护一个简单的状态机
- 适合简单的问答式交互

### 4. 原生 readline + 手动控制

一些工具采用最简单的方案：

```typescript
// 不在输入框显示任何特殊标记
// 粘贴内容直接存储，按回车后显示 "[Pasted X lines]" 作为第一行输出
rl.on("line", (line) => {
  if (pasteBuffer) {
    console.log(`[Pasted ${lineCount} lines]`);
    console.log(pasteBuffer);
    pasteBuffer = null;
  }
});
```

## 建议的后续改进

### 短期（当前 fork）

采用**方案二：简短提示替代占位符**，简单有效地解决重复显示问题。

### 长期（上游 opencode）

考虑引入更现代的 CLI 交互库：

1. **使用 clack 的 @clack/core**：
   - 轻量级，只包含核心功能
   - 成熟的光标控制和渲染逻辑
   - TypeScript 原生支持

2. **或者参考 clack 实现自己的渲染层**：
   - 完全控制输入框渲染
   - 支持富文本、语法高亮
   - 更好的粘贴和多行输入体验

3. **调研支持 bracketed paste 的 readline 替代品**：
   - 如 `node-pty` + 自定义终端模拟
   - 更底层的终端控制
   - 可以支持真正的富文本输入

## 参考链接

- [Clack GitHub](https://github.com/bombshell-dev/clack)
- [Ink GitHub](https://github.com/vadimdemedes/ink)
- [sisteransi npm](https://www.npmjs.com/package/sisteransi)
- [Node.js readline 文档](https://nodejs.org/api/readline.html)
- [ANSI 转义码参考](https://en.wikipedia.org/wiki/ANSI_escape_code)
