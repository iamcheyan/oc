# Minimal Vim Cursorline Status

日期: 2026-05-20
范围: `packages/opencode-vim/**`

## 目标

在 Vim TUI 的 vim normal 模式下实现类似 vim/neovim 的“当前行”概念：

- `j` / `k` / `gg` / `G` / `Ctrl+d` / `Ctrl+u` 基于当前行移动
- 鼠标点击某一行后，将该行设为当前行
- 当前行显示一条很浅的背景高亮
- 不改变正文文字颜色

## 当前状态

已经完成的部分：

- normal 模式有独立的 row model，而不是按 message index 粗略定位
- `j` / `k` / `gg` / `G` / `Ctrl+d` / `Ctrl+u` 已改为走 row model
- 鼠标点击会按 `y` 行定位到当前行
- 在部分 render path 上，当前行浅背景高亮是可见的
  - 典型例子：tool output、shell/bash 返回内容、部分纯文本内容

当前仍未解决的问题：

- `markdown` 正文上看不到当前行背景高亮
- 指向 `markdown` 中文文本时，文字可能发黑，或者表现为“像消失了一样”

## 已验证的事实

### 1. 不是行模型完全失效

当前实现已经能在真实 session 中看到：

- 进入 `NORMAL`
- `j` 向下切换当前行
- `G` 跳到底部
- tool / shell 输出区域上能看到当前行高亮

这说明：

- row selection 本身不是完全坏的
- `copy-mode` 的基本定位和跳转已经工作

### 2. 问题集中在 markdown 渲染路径

`CompactTextPart` 当前使用：

- `<markdown ... content={props.part.text.trim()} />`

而 tool / 普通 text 的视觉表现与 markdown 不同，说明：

- `markdown` 的 render tree / compositing 路径和普通 `text` 不一样
- 当前 `CopyOverlay` 对 markdown 的影响与对普通 text 的影响不同

### 3. “中文消失/发黑”不是普通文字问题

这个问题只在指向 markdown 中文文本时明显暴露。

现象更像：

- overlay 在 markdown 路径里覆盖到了文字 cell
- 或 markdown 自己的 cell/background 写法与 overlay 叠加后产生异常

目前不能再把它归因成简单的“列计算错误”或“全角字符宽度”问题。

## 当前实现

相关文件：

- `packages/opencode-vim/src/feature/copy-mode.ts`
- `packages/opencode-vim/src/feature/vim-mode.tsx`
- `packages/opencode-vim/src/routes/session.tsx`

### `copy-mode.ts`

职责：

- 递归扫描 session render tree
- 用 `CopyRow` 表示“真实显示行”
- 提供：
  - `enter`
  - `exit`
  - `move`
  - `jump`
  - `clamp`
  - `setFromY`
  - `row`
  - `active`
  - `col`

说明：

- 这部分思路参考了 `XPhyro/opencode-vim` 的 `copy mode`
- 当前它已经足够支撑“当前行”语义，不是现在的主要问题源头

### `session.tsx`

当前使用局部 `CopyOverlay`：

- `CompactUserMessage`
- `CompactTextPart`
- `CompactReasoningPart`
- `tool` 外层容器

当前 overlay 已被简化为：

- 只画当前行浅背景
- 不再画块光标
- 不再反色文字

这样做是为了避免：

- 中文全角字符被块光标裁切
- 文字反色/发黑

## 已尝试且已验证失败的路线

### 1. 全局页面顶层 overlay

做法：

- 在 session 顶部放一条 absolute 的整行高亮层

结果：

- 放在内容后面：看不见，被 message/markdown/code 自己背景盖掉
- 放在内容前面：文字被一起染色

结论：

- 这条路不适合 minimal 当前的渲染结构

### 2. 块光标 + 当前字符反色

做法：

- 在当前列渲染 1 格 block cursor
- 使用反色文字显示当前字符

结果：

- 普通 ASCII 还可以
- 中文 / 全角字符会出现裁切、发黑、像消失

结论：

- 如果目标只是 cursorline，不应该继续使用块光标

### 3. 给正文内容统一加 `zIndex=1`，让 overlay 在 `zIndex=0`

做法：

- `CopyOverlay` 设 `zIndex={0}`
- markdown / code / tool / user text 包一层 `zIndex={1}`

结果：

- 行高亮背景整体消失

结论：

- 这一层级修正方式在当前 minimal 结构里不可用
- 已回退

### 4. 去掉 markdown 的 `bg={theme.background}`

做法：

- 让 markdown 看起来更“透明”，希望 overlay 背景能透出来

结果：

- 并没有从根本上解决 markdown 行高亮问题

结论：

- 问题不只是 markdown 自己有没有显式 `bg`
- 更可能是 markdown 内部 cell/render tree 的绘制方式不同

## 与 `ocv` 的差异

参考文档：

- `fork/docs/202605201719_opencode-vim-ocv-summary.md`

`ocv` 的关键点：

- 独立 `copy mode`
- 从 render tree 提取真实显示行
- `CopyOverlay` 局部注入到 part 内

我们已经套用了：

- copy mode 架构
- render tree row model
- 局部 overlay 注入

但当前 minimal 和 `ocv` 仍有差异：

- minimal 的 session 结构更简化
- minimal 里当前 overlay 已被裁成“只保留行背景”
- markdown 中文问题在我们这里仍未解决

## 现在最合理的下一步

后续应只针对 `markdown` 路径继续查，不要再动已经工作的普通 text/tool 路径。

建议顺序：

1. 直接检查 `markdown` renderable 的实际 child tree
2. 确认 `CopyOverlay` 在 markdown part 内部到底是：
   - 被 markdown 覆盖
   - 覆盖了 markdown
   - 还是根本没有命中正确的局部行
3. 如果 markdown 路径与普通 text 路径确实不同：
   - 为 markdown 单独处理 overlay 偏移或局部高亮策略
4. 不再恢复块光标
5. 不再尝试全局整页 overlay

## 最终解决方案 (2026-05-21)

### 问题根源

CJK 字符消失的根本原因是：**绝对定位的覆盖层 (`CopyOverlay`) 与文本组件在同一渲染层级竞争，导致 CJK 字符被覆盖层"清除"**。

这不是透明度问题，也不是颜色问题，而是**渲染层级 (zIndex)** 问题。

### 解决方案

使用 `zIndex` 控制渲染层级：

1. **`CopyOverlay` 设置 `zIndex={0}`** - 将高亮层放在底层
2. **所有文本组件设置 `zIndex={1}`** - 将文本放在高亮层之上

### 具体实现

修改文件：`packages/opencode-vim/src/routes/session.tsx`

```tsx
function CopyOverlay(props: { copy?: CopyPosition }) {
  return (
    <>
      <Show when={props.copy}>
        <box
          position="absolute"
          top={props.copy!.line}
          left={0}
          width="100%"
          height={1}
          backgroundColor={RGBA.fromInts(80, 80, 80, 180)}  // 深灰色半透明
          zIndex={0}  // 放在底层
        />
      </Show>
    </>
  )
}

// 所有文本组件添加 zIndex={1}
function CompactUserMessage(...) {
  <text fg={color()} zIndex={1}>{text()}</text>
}

function CompactTextPart(...) {
  <markdown ... zIndex={1} />
}

function CompactReasoningPart(...) {
  <code ... zIndex={1} />
}
```

### 效果

- ✅ 当前行高亮清晰可见（深灰色半透明背景）
- ✅ CJK 字符（中文、日文、韩文）正常显示
- ✅ 英文、数字正常显示
- ✅ 所有文本内容都能透过半透明高亮层清晰看到

### 为什么之前的尝试失败了

1. **只调整透明度**：CJK 字符仍然被覆盖层"清除"，与透明度无关
2. **只给容器加背景色**：会导致整行都变黑，无法精确高亮当前行
3. **使用 `bg` 属性**：`<text>`、`<markdown>`、`<code>` 组件不支持 `bg` 属性
4. **移除 `CopyOverlay`**：失去了行级精确定位能力

### 关键洞察

OpenTUI 的渲染引擎在处理绝对定位覆盖层和 CJK 字符时存在层级竞争问题。通过显式设置 `zIndex`，可以确保：
- 覆盖层先渲染（作为背景）
- 文本后渲染（在背景之上）

这避免了 CJK 字符被覆盖层"清除"的问题。

## 当前结论

- ✅ row model 工作正常
- ✅ normal 模式导航工作正常  
- ✅ 当前行高亮在所有路径上工作正常（user message、markdown、reasoning、tool）
- ✅ CJK 字符显示正常
- ✅ 英文、数字显示正常

问题已完全解决。

---

## 追加功能记录 (2026-05-21)

### 已实现但未启用的功能

#### 1. 鼠标点击设置当前行

**实现**：点击任意文本行，该行立即成为当前高亮行

**代码位置**：`packages/opencode-vim/src/routes/session.tsx`

**核心逻辑**：
```tsx
const setCursorFromMouse = (event: MouseEvent) => {
  vimMode.enterNormal()  // 点击自动进入 normal 模式
  const clickY = event.y
  copyMode.setFromY(clickY)  // 根据 Y 坐标定位到对应行
}
```

**配合 `setFromY`**：
```typescript
function setFromY(y: number) {
  const list = rows()
  // 找到点击位置对应的行
  let target = list.findIndex((row) => row.y === y)
  if (target < 0) {
    target = list.findLastIndex((row) => row.y <= y)
  }
  setIdx(target)  // 设置为当前行
  setActive(true)
  setStick("first")
  setCol(copyMin(nextRow))
}
```

**状态**：已实现并测试，但**暂时移除**（按用户要求）

---

#### 2. 方向键支持

**实现**：↑↓←→ 方向键映射到 j/k/h/l

**代码位置**：`packages/opencode-vim/src/feature/vim-mode.tsx`

**绑定**：
```tsx
{ key: "down", cmd: () => copyMode.move("down") },
{ key: "up", cmd: () => copyMode.move("up") },
{ key: "left", cmd: () => copyMode.move("left") },
{ key: "right", cmd: () => copyMode.move("right") },
```

**状态**：保留

---

## 功能简化 (2026-05-21)

根据需求，暂时移除以下功能，后续可能恢复：

- ❌ 鼠标点击设置当前行

保留的核心功能：
- ✅ `gg` - 跳转到顶部（直接设置 scrollTop = 0）
- ✅ `G` (shift+g) - 跳转到底部（直接设置 scrollTop = max）
- ✅ `j` / `k` - 翻页移动（待改为翻页而非逐行）

简化后的设计原则：
1. 只保留最基本的 vim 导航
2. 不涉及复杂的鼠标交互
3. 后续根据需要逐步添加功能
