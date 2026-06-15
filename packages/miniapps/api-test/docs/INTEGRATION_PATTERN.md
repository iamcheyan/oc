# Standalone + Minimal 集成模式

## 概述

本文档描述如何创建一个独立的 TUI 程序，使其既能独立运行，也能被 minimal 框架调用。

## 架构

```
packages/
├── my-tool/                      # 独立程序
│   ├── src/
│   │   ├── index.ts              # 入口（独立运行）
│   │   ├── my-tool-ui.ts         # UI 组件（可复用）
│   │   └── my-tool-logic.ts      # 业务逻辑
│   └── package.json
│
└── opencode-vim/
    └── src/
        └── feature/
            └── vim-mode.tsx      # 调用 UI 组件
```

## 文件结构

### 1. UI 组件 (`my-tool-ui.ts`)

导出可复用的 UI 组件：

```typescript
import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"

// 导出颜色常量
export const P = {
  bg: "#0a0e17",
  text: "#e2e8f0",
  // ...
}

// 导出 UI 接口
export interface MyToolUI {
  root: BoxRenderable
  destroy(): void
  handleKeyPress(key: { name: string }): boolean
  refresh(): void
}

// 创建 UI 的工厂函数
export function createMyToolUI(renderer: CliRenderer): MyToolUI {
  // 1. 创建 UI 元素
  const root = new BoxRenderable(renderer, { ... })
  
  // 2. 加载数据
  const data = loadData()
  
  // 3. 返回控制接口
  return {
    root,
    destroy() { /* 清理 */ },
    handleKeyPress(key) { /* 处理按键 */ },
    refresh() { /* 刷新显示 */ },
  }
}
```

### 2. 独立入口 (`index.ts`)

独立运行时使用：

```typescript
import { createCliRenderer } from "@opentui/core"
import { createMyToolUI, P } from "./my-tool-ui"

async function main() {
  // 创建 renderer
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    backgroundColor: P.bg,
  })

  // 创建 UI
  const ui = createMyToolUI(renderer)
  renderer.root.add(ui.root)

  // 设置键盘
  renderer.keyInput.on("keypress", (key) => {
    if (key.name === "q") {
      ui.destroy()
      renderer.destroy()
      process.exit(0)
    }
    ui.handleKeyPress(key)
  })
}

main()
```

### 3. package.json

配置导出：

```json
{
  "name": "my-tool",
  "exports": {
    ".": "./src/my-tool-logic.ts",
    "./ui": "./src/my-tool-ui.ts"
  }
}
```

## minimal 调用方式

### 方式 1：直接使用 UI 组件（推荐）

如果 minimal 使用 @opentui/solid (JSX)：

```tsx
import { createMyToolUI, P } from "my-tool/ui"

function MyToolDialog(props: { dialog: any }) {
  let ui: MyToolUI | null = null

  onMount(() => {
    // 获取 Dialog 的 renderer
    const renderer = props.dialog.getRenderer()
    
    // 创建 UI
    ui = createMyToolUI(renderer)
    
    // 添加到 Dialog
    props.dialog.setContent(ui.root)
  })

  onCleanup(() => {
    ui?.destroy()
  })

  // 转发键盘事件
  useBindings(() => ({
    bindings: [
      { key: "up", cmd: () => ui?.handleKeyPress({ name: "up" }) },
      { key: "down", cmd: () => ui?.handleKeyPress({ name: "down" }) },
      { key: "return", cmd: () => ui?.handleKeyPress({ name: "return" }) },
    ],
  }))

  return null  // UI 已通过 setContent 添加
}
```

### 方式 2：只导入逻辑和颜色

如果 minimal 有自己的 UI 实现：

```tsx
import { colors } from "my-tool/ui"
import { loadData, processData } from "my-tool"

function MyToolDialog() {
  // 使用相同的颜色
  const GREEN = colors.green
  const TEXT = colors.text
  
  // 使用相同的逻辑
  const data = loadData()
  
  // 渲染自己的 UI
  return <box>...</box>
}
```

## 关键点

1. **renderer 是参数**：`createMyToolUI(renderer)` 接收任意 renderer，不关心是谁创建的

2. **颜色统一**：导出 `P` 对象，两边使用相同的颜色

3. **逻辑复用**：业务逻辑放在单独的文件，两边都可以导入

4. **键盘处理**：`handleKeyPress()` 返回 boolean，表示是否处理了按键

5. **生命周期**：
   - `destroy()` 清理资源
   - `refresh()` 刷新显示

## 验证

独立运行和被调用时应该看到完全相同的界面和操作：

```bash
# 独立运行
cd packages/my-tool && bun run src/index.ts

# 通过 minimal 调用
cd packages/opencode-vim && bun run src/index.ts
# 然后打开 Dialog
```

## 示例：api-test-standalone

参考 `packages/api-test-standalone` 的实现：
- `src/api-test-ui.ts` - UI 组件
- `src/index.ts` - 独立入口
- `src/api-test.ts` - 业务逻辑
