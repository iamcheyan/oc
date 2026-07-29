# [202605191645] 上游 Seam 边界分析：为何无法完全消除

## 动机

opencode-vim 有 3 个上游 seam 文件，每次上游同步时都可能产生 merge 冲突。一个自然的想法是：能不能把所有 fork 逻辑都搬到 `packages/opencode-vim/` 里，让这 3 个文件零修改？

经过深入分析，结论是：**这 3 个 seam 不能完全消除**。本文档解释原因、记录边界条件，并给出推荐策略。

---

## Seam 1: app.tsx（根视图注入 + Renderer 配置）

### 文件

`packages/opencode/src/cli/cmd/tui/app.tsx`

### 无法消除的原因

上游的 TUI 路由直接在 app.tsx 中硬编码渲染 Home 和 Session：

```tsx
<Match when={route.data.type === "home"}>
  <Home />
</Match>
<Match when={route.data.type === "session"}>
  <Session />
</Match>
```

没有插件机制、没有 hook、也没有 prop 可以替换这两个组件。要注入 fork 的 MinimalHome/MinimalSession，**必须**在 app.tsx 中加一个间接层：

```tsx
const View = globalThis.OPENCODE_TUI_ROOT_COMPONENTS?.Home ?? Home
return <View />
```

此外，renderer 的 screenMode（如 `main-screen` 替代默认的 `split-screen`）只能通过修改 rendererConfig 实现。

### 替代方案评估

| 方案 | 可行性 |
|---|---|
| 把路由选择逻辑移到外部 | ❌ 路由是 SolidJS context，在外部无法干涉 app.tsx 的渲染树 |
| 用插件 API 替换根组件 | ❌ 上游插件 Slot 机制只针对局部区域，不支持替换整个 Home/Session |
| 完整 fork app.tsx 到 opencode-vim | ❌ 意味着 fork 整个 TUI 启动栈，维护成本远大于当前薄 seam |

### 结论：**必须修改**，但 seam 极薄（~5 行根组件注入 + ~3 行 renderer 配置）

---

## Seam 2: session/index.tsx（间距与外观分支）

### 文件

`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

### 无法消除的原因

opencode-vim 想要"紧凑"外观（0 padding、0 margin、无边框），而上游 session 有完整间距。差异点包括：

- `paddingBottom: 0 / 1`
- `paddingLeft: 0 / 2`
- `paddingRight: 0 / 2`
- `gap: 0 / 1`
- `marginTop: 0 / 1`
- 有框 / 无框
- 背景色选择

这些值直接写在 JSX 的 props 里，没有 CSS 或外部样式机制可以覆盖。要改变它们，**必须**修改 JSX 中的字面量。

### 为什么不能放在外部封装

用户可能会想：能不能把 Session 包装一层，让外部组件覆盖内部样式？

技术上不可行，因为 SolidJS 的组件内部 JSX 是直接生成的，外部无法在渲染后干涉内部元素的样式 props。没有类似 React 的 `style` 继承或 CSS 级联机制。

### 替代方案评估

| 方案 | 可行性 |
|---|---|
| 用 Context 统一传递间距值 | ❌ 间距值散落在约 30 处 JSX 属性中，改为 Context 读取只是把 "env 读取" 换成了 "Context 读取"，代码行数不变，merge 风险相同 |
| 把间距值移到 theme/配置 | ❌ 同上，仍需修改每处 JSX 属性 |
| 在 opencode-vim 中写完整的 Session 副本 | ❌ 这是 2000+ 行的文件，全副本的维护成本远超当前 30 处 ternaries |
| 接受上游默认外观，砍掉紧凑模式 | ✅ **可行** — 如果 minimal 模式使用和上游完全一样的外观，这个文件可以零修改。代价是 minimal 和完整 TUI 视觉上无区别 |

### 结论：**要么修改（~30 处 ternaries），要么放弃紧凑外观**

---

## Seam 3: prompt/index.tsx（提示行外观分支）

### 文件

`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

### 无法消除的原因

minimal 模式想要一个 CLI 风格的提示行（`»` 符号 + 输入框），而上游是带边框、装饰条、agent/model 标签、状态栏的复杂 prompt。

两个分支共享同一套复杂状态：`input`（TextareaRenderable）、`store`（prompt 内容、mode、extmarks）、`submit()`、`pasteText()`、`auto()` 等。

要提取 minimal prompt 到单独文件，需要把所有这些状态以 props/hooks 形式暴露出来，相当于给上游 Prompt 组件创建一个完备的外部 API——这本身就是一个大工程。

### 替代方案评估

| 方案 | 可行性 |
|---|---|
| 提取 minimal prompt 到外部组件 | ⚠️ 理论上可行，但需要把 Prompt 的 ~30 个内部状态变量和函数全部以 props/hooks 形式导出，改动的上游代码行数可能多于当前 seam |
| 在 opencode-vim 写独立的 prompt | ❌ 会丢失上游所有 prompt 功能：斜杠命令、自动补全、粘贴处理等，实质上是倒退 |
| 用 `Show when={minimal()} / fallback` 两条分支 | ✅ **当前方案**，共享状态逻辑，只在渲染层分岔 |

### 结论：**当前 Show/fallback 方式是最优妥协**

---

## 核心权衡

```
                    零上游修改（理想）
                    │
                    │  ✗ session 紧凑外观
                    │  ✗ prompt CLI 风格
                    │
          ┌─────────┴─────────┐
          │                   │
   接受上游默认外观    保留 3 个薄 seam
   session 0 修改       session ~30 处 ternaries
   prompt  0 修改       prompt  2 条 Show/fallback 分支
          │                   │
          │                   │
    视觉无差异          ✓ merge 可控
    功能完整            ✓ 视觉差异化
                        ✓ seam 已文档化
```

---

## 推荐策略

### 短期（当前）

1. **接受 3 个薄 seam 的存在**，不追求零修改
2. 使用 **`process.env.OPENCODE_MINIMAL*`** 作为检测手段（最简单、最直观、无额外类型负担）
3. **不要**引入全局配置对象 / Context 包装等额外抽象——它们不会减少 seam 的修改行数，只会增加复杂度
4. 每次上游同步时，对这 3 个文件：
   - 优先取上游版本
   - 重新手动应用 seam 修改
   - 参考本文档的 seam 范围和边界

### 中期

- 如果上游暴露了 root 组件替换接口 → 消除 app.tsx seam
- 如果上游 Prompt 重构出外部渲染 API → 提取 minimal prompt 到 opencode-vim

### 长期

- 如果 opencode-vim 的功能需求与上游 TUI 分歧继续扩大 → 考虑在 `packages/opencode-vim/` 中维护独立的 Session 渲染器，而不是在上游文件中加分支

---

## 相关文件

- 上游 seam 清单：`fork/docs/202605191430_minimal-upstream-seams.md`
- 最小化包实现：`packages/opencode-vim/`
- 同步脚本：`fork/update.sh`

---

## 附录：当前 seam 修改摘要（未提交）

以下是我们本次优化尝试的记录：

### 尝试过但放弃的方案

**全局配置对象（`globalThis.OPENCODE_TUI_MINIMAL_CONFIG`）**

- 把散落的 `process.env` 读取替换为一个全局配置
- 优点：配置类型化、集中管理
- 缺点：仍需修改每处 JSX 属性（`isMinimalTuiEnabled() ? 0 : 1` → `config.spacing.paddingBottom`），seam 行数不减少
- 额外问题：tsgo（TypeScript Go 编译器）对 `declare global` 支持不完善，需要 `as any` 类型断言
- **结论：不值得，已回退**

### 保留的有益清理

- `packages/opencode-vim/src/root-components.ts`：移除了与 `app.tsx` 重复的 `declare global` 声明
- `packages/opencode-vim/src/runtime.ts`：简化了 env 变量设置逻辑
