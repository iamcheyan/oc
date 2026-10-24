# SimpleTool vs ToolPart 差异分析

**日期**: 2026-05-21  
**组件**: `packages/opencode-vim/src/component/simple-tool.tsx`

## 修改对比

### 1. 视觉样式差异

| 特性 | ToolPart (Upstream) | SimpleTool (Minimal) | 影响 |
|------|---------------------|----------------------|------|
| **左边框** | `border={["left"]}` 有左边框 | ❌ 无边框 | 视觉上不再区分 tool 边界 |
| **左侧缩进** | `paddingLeft={2}` 或 `paddingLeft={3}` | ❌ 无缩进 | 内容贴左边缘 |
| **顶部间距** | `marginTop={1}` | ❌ 无 margin | 使用 `<text></text>` 空行代替 |
| **背景色** | `theme.backgroundPanel` 或 `theme.backgroundElement` | ❌ 透明 | 使用终端默认背景 |
| **行号栏** | `<line_number minWidth={3}>` | ❌ 无行号 | 代码不显示行号 |

### 2. 代码高亮支持

**ToolPart 实现**:
```tsx
// Write 工具
<line_number fg={theme.textMuted} minWidth={3} paddingRight={1}>
  <code
    conceal={false}
    fg={theme.text}
    filetype={filetype(props.input.filePath!)}
    syntaxStyle={syntax()}
    content={code()}
  />
</line_number>
```

**SimpleTool 实现**:
```tsx
<code
  filetype={filetype()}
  syntaxStyle={syntax()}
  content={input().content}
  fg={theme.text}
  drawUnstyledText={false}
/>
```

**差异**:
- ✅ **语法高亮**: 两者都支持，使用相同的 `<code>` 组件
- ✅ **Filetype 检测**: SimpleTool 自动从文件后缀检测
- ❌ **行号**: ToolPart 有行号，SimpleTool 无行号
- ❌ ** Conceal**: ToolPart 支持 `conceal={false}`，SimpleTool 未设置

### 3. 工具类型支持

**ToolPart 支持的工具**:
- bash/shell - 完整渲染，带标题栏
- write - 文件写入，带行号和语法高亮
- edit - 文件编辑，带 diff 显示
- read - 文件读取，带语法高亮
- glob/grep - 搜索结果
- 其他所有工具（GenericTool）

**SimpleTool 支持的工具**:
- bash/shell - 命令和输出，bash 语法高亮
- write/edit - 文件路径和内容，自动检测语言
- read - 文件路径和内容
- glob/grep - 搜索模式
- 其他工具（通用显示）

## 具体功能影响分析

### ✅ Bash 反馈

**状态**: ✅ 正常工作

**差异**:
- ToolPart: 使用 `BlockTool` 包裹，有标题栏、左边框、背景色
- SimpleTool: 纯文本显示，命令前加 `$`，输出使用 `<code filetype="bash">`

**示例对比**:
```
# ToolPart (Upstream)
├─ # Shell command in /path
├─ $ ls -la
├─ total 128
├─ drwxr-xr-x  5 user group  160 May 21 10:00 .

# SimpleTool (Minimal)
[空行]
$ ls -la
total 128
drwxr-xr-x  5 user group  160 May 21 10:00 .
[空行]
```

**影响**: 
- 功能正常，语法高亮保留
- 视觉上更紧凑，无边框装饰
- 适合 minimal 风格

### ✅ Code 显示

**状态**: ✅ 正常工作

**支持的语言**:
- TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)
- Python (`.py`)
- Rust (`.rs`)
- Go (`.go`)
- Bash (`.sh`)
- Markdown (`.md`)
- JSON (`.json`)
- YAML (`.yaml`, `.yml`)
- CSS (`.css`)
- HTML (`.html`)

**示例对比**:
```
# ToolPart (Upstream)
├─ # Wrote src/index.ts
├─ 1 │ import { foo } from "./bar";
├─ 2 │ 
├─ 3 │ export function main() {

# SimpleTool (Minimal)
[空行]
→ src/index.ts
import { foo } from "./bar";

export function main() {
[空行]
```

**影响**:
- ✅ 语法高亮完全保留
- ❌ 无行号显示
- ❌ 无左边框装饰
- ✅ 内容占满全宽，更紧凑

### ⚠️ Diff 显示

**状态**: ⚠️ 部分受影响

**ToolPart 的 Diff 显示**:
```tsx
// Edit 工具使用 diff 高亮
<Match when={props.part.tool === "edit"}>
  <BlockTool title={title()} part={props.part}>
    <line_number ...>
      <code ... />  // 可能支持 diff 高亮
    </line_number>
  </BlockTool>
</Match>
```

**SimpleTool 的 Diff 显示**:
```tsx
<Match when={tool().tool === "write" || tool().tool === "edit"}>
  ...
  <code filetype={filetype()} ... />  // 使用文件类型，不是 diff
</Match>
```

**潜在问题**:
1. **Filetype 检测**: 
   - ToolPart: 从 `props.input.filePath` 检测
   - SimpleTool: 同样从 `input().filePath` 检测
   - ✅ 应该一致

2. **Diff 高亮**:
   - 如果 edit 工具输出的是 diff 格式（`+`、`-` 开头）
   - 但 filetype 检测可能返回原文件类型（如 `.ts`）而不是 `diff`
   - 结果：diff 标记可能没有专门的绿色/红色高亮

3. **行号对齐**:
   - ToolPart: 有行号，diff 的行号可以对应原文件
   - SimpleTool: 无行号，纯文本显示

**建议**:
如需完整 diff 支持，可改进 SimpleTool：
```typescript
const filetype = createMemo(() => {
  // 检测是否为 diff 内容
  const content = input().content || output()
  if (content?.includes('\n+') || content?.includes('\n-')) {
    return "diff"
  }
  // 原有检测逻辑...
})
```

### 其他工具

| 工具 | ToolPart | SimpleTool | 状态 |
|------|----------|------------|------|
| **read** | 带语法高亮、行号 | 带语法高亮、无行号 | ✅ 正常 |
| **glob** | 文件列表带边框 | 纯文本列表 | ✅ 正常 |
| **grep** | 搜索结果带边框 | 纯文本结果 | ✅ 正常 |
| **task** | Sub-agent 任务 | 同左 | ✅ 正常 |
| **todo** | Todo 列表 | 未专门处理，显示为通用工具 | ⚠️ 可能格式简化 |
| **question** | 问题提示 | 未专门处理 | ⚠️ 可能格式简化 |

## 功能完整性评估

| 功能 | 完整性 | 说明 |
|------|--------|------|
| **内容显示** | 100% | 所有内容都能正确显示 |
| **语法高亮** | 95% | 支持主流语言，diff 高亮可能不完整 |
| **视觉装饰** | 30% | 移除边框、背景、行号等装饰 |
| **可读性** | 90% | 内容清晰，但缺少行号定位 |
| **Minimal 风格** | 100% | 达成设计目标 |

## 风险点

### 低风险 ✅
- Bash 输出：完全支持
- Code 显示：语法高亮正常
- 文件内容：正确渲染

### 中风险 ⚠️
- **Diff 高亮**：可能不如 ToolPart 精确
- **大文件**：无行号，定位困难
- **工具识别**：SimpleTool 使用通用匹配，某些工具可能显示不够精细

### 缓解措施
如需改进，可后续添加：
1. Diff 内容检测和专门高亮
2. 可选行号显示（配置项）
3. 特定工具的精细化显示（如 todo、question）

## 总结

**SimpleTool 适合场景**:
- ✅ 追求极简界面
- ✅ 不需要行号定位
- ✅ 以内容为主，弱化装饰

**SimpleTool 不适合场景**:
- ❌ 需要精确行号引用
- ❌ 频繁的 diff 审查（需要高亮差异）
- ❌ 复杂工具的详细展示

**当前状态**: 对于 minimal 模式的使用场景，SimpleTool 的权衡是可接受的。
