# [202607292300] 接管启动执行计划

> 日期：2026-07-29
> 分支：`fork-clean-queue`
> 前置文档：`202607292224_upstream-conflict-reduction-roadmap.md`（方案 B / Phase 1）

## 目标

把 TUI 启动路径从「寄生上游 `app.tsx`」改为「fork 自有 `run.tsx`」，
使 `packages/tui/src/app.tsx` 与 `upstream/dev` 字节级一致（0 diff），
上游热文件 seam 只剩 `processor.ts` 1 行。

## 现状回顾

```
opencode-vim minimal.ts
  → applyMinimalModeDefaults()          // 设 env
  → installMinimalRootComponents()      // 写 globalThis
  → TuiThreadCommand.handler(args)      // @opencode/cli/cmd/tui
    → worker + RPC transport
    → ../tui/layer run
    → @opencode-ai/tui run(app.tsx)     // 4 处 FORK-SEAM 在这里
      → App 组件
        → Switch → globalThis 注入 MinimalHome/MinimalSession
```

## 目标架构

```
opencode-vim minimal.ts
  → applyMinimalModeDefaults()          // 设 env（不变）
  → createThreadTransport(args)         // fork 自有 transport plumbing
  → runVimTui({ ...transport, config, args })
    → fork 自有 run()                   // 复制上游 run + Provider 树
      → renderer + keymap + 20 层 Provider
      → VimApp                          // 复制上游 App，路由根直接用 MinimalHome/MinimalSession
```

## 代码量评估

| 模块 | 来源 | 行数 | 说明 |
|------|------|------|------|
| `runVimTui` (run + Provider 树) | 复制 app.tsx `run` | ~195 | renderer 创建、keymap、Provider 树组装 |
| `VimApp` | 复制 app.tsx `App` | ~780 | 命令注册、事件处理、路由 Switch、args/continue/fork |
| `createThreadTransport` | 复制 tui.ts handler plumbing | ~110 | worker、RPC、transport、validateSession |
| 合计 | | ~1085 | 全部在 `packages/opencode-vim/src/`，不碰上游 |

**代价**：上游改 `App`/`run` 签名时，fork 拿到编译错误（而非 git 冲突）。
**收益**：`app.tsx` 0 diff；rebase 不再卡在 app.tsx 文本冲突。

## fork UI 对 App 的依赖（已审计）

VimApp 必须保留的 App 职责：

1. **ready signal + plugin host start**（434-447）
2. **args effect**：`--model`/`--agent`/`--session` 初始化（505-526）
3. **--continue / --fork effect**：自动导航到 session（528-565）
4. **命令注册**：leader menu 依赖 `agent.list`、`agent.cycle`、`theme.switch`、
   `theme.switch_mode`、`theme.mode.lock`、`session.new`、`session.list`、
   `provider.connect`、`variant.list`、`command.palette.show` 等（586-987）
5. **事件处理**：`tui.command.execute`、`tui.toast.show`、`tui.session.select`、
   `session.deleted`、`session.error`（1012-1056）
6. **terminal title**（479-503）
7. **selection copy**（449-473）
8. **plugin route**（1108-1114）
9. **路由 Switch 渲染**（1116-1170）—— 直接用 `MinimalHome`/`MinimalSession`

VimApp **删除**的 App 职责：

- `installation.update-available` 事件订阅（1058-1106）—— fork 不做更新提示
- `globalThis.OPENCODE_TUI_ROOT_COMPONENTS` 注入点 —— 直接渲染 fork 组件
- `OPENCODE_MINIMAL_*` env 读取从 app.tsx 搬到 runVimTui

## 执行步骤（每步一个 commit）

### Step 0 — seam 预算门禁

**文件**：`fork/check-upstream-seams.sh`

在现有 allowlist 检查之后，加一行：统计 `packages/` 内 FORK-SEAM marker 总数，
若超过基线值（当前 = 5：app.tsx 4 + processor 1）则 fail。

**commit**：`feat(fork): add seam marker budget gate`

---

### Step 1 — fork 自有 transport plumbing

**新文件**：`packages/opencode-vim/src/thread-transport.ts`

从 `packages/opencode/src/cli/cmd/tui.ts` 复制 worker + RPC + transport 逻辑：
- `target()` — worker 路径解析
- `createWorkerFetch()` — RPC fetch adapter
- `createEventSource()` — RPC event source
- `createThreadTransport(args)` — 组装 `{ url, fetch, events, headers, stop }`
- 复用上游 `resolveThreadDirectory`（已 export）、`validateSession`、`ServerAuth`

**不碰上游**：所有代码在 fork 包内，import 上游的导出构件。

**commit**：`feat(opencode-vim): add fork-owned thread transport`

---

### Step 2 — fork 自有 TUI 启动壳（runVimTui + VimApp）

**新文件**：`packages/opencode-vim/src/run.tsx`

内容：
1. `runVimTui(input)` —— 复制 app.tsx `run`（196-390）：
   - renderer 创建（`screenMode`/`footerHeight` 从 env 读取，同现状）
   - keymap 注册
   - 20 层 Provider 树（ExitProvider → ... → LocationProvider → VimApp）
   - `Effect.provide(AppNodeBuilder.build(Global.node))`

2. `VimApp(props)` —— 复制 app.tsx `App`（392-1170），改写：
   - 路由 Switch：`<MinimalHome />` / `<MinimalSession />` 直接渲染（无 globalThis）
   - 删除 `installation.update-available` 订阅
   - 保留命令注册、事件处理、args/continue/fork、terminal title、selection copy
   - `model.list` 命令：用 fork 的 `ForkModelCommand`（vim-mode 已拦截，但命令注册仍需保留以匹配 leader menu dispatch）

**commit**：`feat(opencode-vim): add fork-owned TUI startup shell`

---

### Step 3 — 接线 minimal.ts

**文件**：`packages/opencode-vim/src/minimal.ts`

改 handler：
```ts
// 之前
installMinimalRootComponents()
await TuiThreadCommand.handler(args)

// 之后
const transport = await createThreadTransport(args)
await Effect.runPromise(
  runVimTui({ ...transport, config, pluginHost, args })
)
```

- 删除 `installMinimalRootComponents()` 调用
- 删除 `TuiThreadCommand` import
- 保留 `applyMinimalModeDefaults()` 和 `--free` 逻辑

**commit**：`refactor(opencode-vim): wire minimal entry to fork-owned startup`

---

### Step 4 — 验证 + 修复

- `cd packages/opencode-vim && bun typecheck`
- `bash fork/build.sh`（Vim smoke）
- `cd packages/opencode-vim && bun test`
- 修复编译错误（Provider API 漂移、import 路径等）

**commit**（如有修复）：`fix(opencode-vim): resolve startup shell compile errors`

---

### Step 5 — 删除 app.tsx seam，还回上游

**文件**：`packages/tui/src/app.tsx`

删除全部 4 处 FORK-SEAM：
1. `declare global { OPENCODE_TUI_ROOT_COMPONENTS }`（90-98）
2. `OPENCODE_MINIMAL_*` renderer 参数读取（199-213）→ 恢复为上游原样（screenMode/footerHeight = undefined）
3. `OPENCODE_MINIMAL_DISABLE_UPDATE_CHECK` 守卫（1059-1060）
4. 路由根 globalThis 解析（1144-1146, 1152-1154）→ 恢复为 `<Home />` / `<Session />`

**验证**：`git diff upstream/dev -- packages/tui/src/app.tsx` → 应为空。

**commit**：`refactor(tui): remove fork seams from app.tsx`

---

### Step 6 — 清理 root-components + 更新 allowlist

**文件**：
- `packages/opencode-vim/src/root-components.ts`：删除 `globalThis` 注入和 `declare global`，
  只保留 `installCjkSafeOverlayPatch()` + `addTheme()`。
- `fork/upstream-seams.allowlist`：删除 `packages/tui/src/app.tsx` 行。
- `fork/check-upstream-seams.sh`：更新 seam 基线（5 → 1）。

**commit**：`chore(fork): drop app.tsx from seam allowlist and clean root-components`

---

### Step 7 — 最终验证

- `bash fork/check-upstream-seams.sh` → pass
- `cd packages/opencode-vim && bun typecheck` → pass
- `bash fork/build.sh` → Vim smoke pass
- `git diff --stat upstream/dev -- packages/tui/src/` → 空
- `git diff --stat upstream/dev` → 仅 fork 自有路径 + processor 1 行 + package.json 1 行

**commit**（如有修复）：`fix(fork): final takeover verification fixes`

---

## 不做（本计划范围外）

- processor.ts seam（方案 C）—— 需要产品决策（deny 后继续 vs 停一轮），单独处理
- 上游微 PR（方案 D）—— 并行试探，不阻塞本计划
- fork UI 副本瘦身（prompt.tsx 等）—— 漂移债，独立于冲突收敛

## 风险

1. **VimApp 漏注册命令**：leader menu dispatch 找不到 handler → 静默无响应。
   缓解：Step 4 smoke test 逐个 leader menu 项验证。
2. **Provider API 漂移**：复制时上游已改签名 → 编译错误。
   缓解：Step 4 typecheck 暴露，逐个修。
3. **transport plumbing 漂移**：上游改 worker/RPC 协议 → 运行时错误。
   缓解：Step 4 build + smoke 暴露。