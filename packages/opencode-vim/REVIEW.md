# opencode-vim 包审查记录

> 审查日期: 2026-07-16
> 范围: `packages/opencode-vim/**`
> 状态: `bun typecheck` 通过、`bun test` 9 pass / 0 fail

本文件记录审查发现的问题，按"逐行清理"的工作顺序分组。每条都标了严重度、位置、说明和建议处理。已处理的条目会在末尾标注。

---

## A. 死代码 / 孤儿文件（优先清理，降噪）

### A1. `src/component/recent-sessions.tsx` 整个文件死代码【高】
- `RecentSessions` 组件在整个包内零引用（`rg "RecentSessions|recent-sessions" src` 只有定义自身那一行）。
- 67 行，含一段 `createEffect` + `onSessionsChange` 回调，但没有任何父组件挂载它。
- 建议: 删除整个文件。

### A2. 根目录 `test_ansi.ts` / `test_ansi2.ts` / `test_buffer.ts` 调试残留【高】
- 三个文件直接调用 `@opentui/core/lib/native` 的 `resolveRenderLib()` 调试 CJK overlay buffer 渲染。
- 不在 `test/` 目录、不被 `bun test` 收集、不被任何代码 import。
- 是 `install-cjk-safe-overlay` 开发期的手工调试脚本。
- 建议: 删除三个文件（机制已沉淀到 `install-cjk-safe-overlay.ts`，不需要再留）。

### A3. `src/subagent-demo.ts` 实验性 demo 残留【中】
- 只在 `package.json` 的 `demo:subagent` script 里被引用，不属于 TUI 代码路径，src 内无 import。
- 是一个纯 stdout 的 session 导航交互演示（171 行）。
- 建议: 删除文件并移除 `package.json` 的 `demo:subagent` script；若想保留演示价值，挪到 `examples/` 并在文档说明，否则长期维护负担大于价值。

### A4. `src/util/locale.ts` 的 `time()` / `datetime()` 死导出【中】
- 新加的 `time()` 和 `datetime()` 除了 `datetime` 内部调用 `time` 外，全包零引用。
- 包内用到的都是 upstream 的 `Locale.todayTimeOrDateTime` / `Locale.duration` / `Locale.truncate` / `Locale.number` / `Locale.titlecase`。
- 建议: 删除这两个函数，只保留 `export * from "../../../opencode/src/util/locale"`。

### A5. ~~`src/util/locale.ts` 用相对路径穿透到 opencode 包~~【放弃】
- 原想改成 `export * from "@/util/locale"`，但 `tsconfig` 的 `@/*` 别名解析顺序是 `["./src/*", "../opencode/src/*"]`，`@/util/locale` 会先匹配到本包自己的 `src/util/locale.ts`，形成自引用循环，导致 `Locale` 命名空间成员全部丢失（20 个 typecheck 错误）。
- 结论: 这里只能用相对路径，保持现状。

### A6. `src/assets.d.ts` 声明过宽【低】
- 原文件声明了 `*.wav` / `*.mp3` / `*.wasm` 模块。
- 复查后确认不能删除整个文件：`opencode-vim` 的 tsconfig 会通过 `@/*` path fallback 引入 `../opencode/src/*`，而 `opencode/src/image/image.ts` 需要 `*.wasm` 模块声明。
- 处理: 删除未使用的 wav/mp3 声明，保留最小 `*.wasm` 声明。

---

## B. 调试代码遗留（必须清理）

### B1. `src/feature/vim-mode.tsx` 两处 `/tmp/quick-model-debug.log` 调试日志【高】
- 第 1137-1138 行和第 1609-1611 行各有一段：
  ```ts
  const debugMsg = `[quick-model] key=${key} slots=${JSON.stringify(cfg.slots)} model=${JSON.stringify(model)}\n`
  try { require("node:fs").appendFileSync("/tmp/quick-model-debug.log", debugMsg) } catch {}
  ```
- 这是排查 slot 映射时遗留的调试代码，不该留在生产路径里。
- 还有个附带问题：在 ESM 包里用 `require("node:fs")`，虽然 Bun 支持，但和包内其它地方统一用 `import { ... } from "node:fs"` 的风格不一致。
- 建议: 删除这两段调试日志（4 行 + 注释）。

### B2. `src/config/quick-model.ts` 迁移逻辑里的 `require("node:fs")`【中】
- 第 64 行 `try { require("node:fs").unlinkSync(localPath) } catch {}`。
- 文件顶部已经 `import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"`，这里却用 `require` 调 `unlinkSync`，既不一致也漏掉了对 `unlinkSync` 的 import。
- 建议: 把 `unlinkSync` 加到顶部 import，改用 `unlinkSync(localPath)`。

---

## C. Bug / 逻辑问题

### C1. `src/model-select.ts` 非 TTY 下立即返回的竞态【高】
- 第 102-108 行用 `setInterval` 轮询 `process.stdin.isRaw` 来判断用户是否选完：
  ```ts
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (!process.stdin.isRaw) {
        clearInterval(interval)
        resolve()
      }
    }, 50)
  })
  ```
- 但前面只有 `if (process.stdin.isTTY) process.stdin.setRawMode(true)`。非 TTY 时根本没开 raw mode，`process.stdin.isRaw` 一开始就是 `false`，Promise 会在第一个 50ms tick 立即 resolve，`selectedModel` 还是 undefined，直接走到"Selection cancelled"。
- 更糟的是：即使在 TTY 下，`isRaw` 作为"用户选完了"的信号很脆弱——`finish()` 里 `setRawMode(false)` 之后 interval 才 resolve，逻辑上能跑但耦合别扭。
- 建议: 用 `EventEmitter` 或 `once` 监听一个显式的"完成"事件，而不是轮询 `isRaw`。

### C2. `src/config/quick-model.ts` `loadQuickModelConfig()` 无参调用与签名不匹配【中】
- 签名是 `loadQuickModelConfig(_projectDir?: string)`，但 `vim-mode.tsx` 第 1134、1607 行调用 `loadQuickModelConfig()` 不传参。
- 不传参时迁移分支 `if (_projectDir)` 永远为 false，本地 `.oc/quick-model.jsonc` 永远不会被迁移。
- 虽然迁移是一次性的，但两个调用点都在 leader 菜单里、拿得到 `directory()`，却没传，导致迁移路径在这些入口下是死的。
- 建议: 两处改成 `loadQuickModelConfig(directory())`，和 `prompt.tsx`/`dialog-quick-model.tsx` 保持一致。

### C3. `src/sdk/install-patches.ts` ESM monkey patch 不可行【高】
- 原文件直接覆写 `Sdk.createOpencodeClient`。
- 复查时用 Bun 直接 import 验证，运行时报错：`TypeError: Attempted to assign to readonly property.`
- 结论: 这不是单纯缺幂等保护，而是 ESM namespace export 在运行时不可写；副作用 patch 会导致 `opencode-vim` 启动崩溃。
- 处理: 删除 `src/sdk/install-patches.ts`、孤儿 `src/sdk/patch-config-providers.ts`、只剩测试引用的 `src/util/config-model-default.ts` 及其测试，并移除 `index.ts` 的副作用 import。

### C4. `src/config/leader-menu.ts` `binaryExists` 用 `which`，非 POSIX 不可靠【低】
- 第 137 行 `execSync(\`which ${name}\`)`：
  - `name` 直接拼进 shell 命令，虽然目前 name 来自配置，但属于命令注入面（配置文件若写 `"; rm -rf ~ #"` 会执行）。
  - `which` 在某些系统（如部分 BSD/最小镜像）不存在；更稳妥用 `command -v` 或 Node 的 PATH 遍历。
- 建议: 至少对 `name` 做白名单校验（`/^[a-zA-Z0-9_.-]+$/`），或改用 `command -v`。

### C5. `stripJsonComments` 在三个文件里各复制了一份【低】
- `src/config/vim.ts:10`、`src/config/leader-menu.ts:44`、`src/util/backup.ts:12` 三处各有一份几乎逐字相同的 `stripJsonComments`（约 55 行 × 3）。
- `quick-model.ts` 则用正则版（`replace(/\/\/.*$/gm)…`），是第四种实现，且正则版会误删字符串内的 `//`（例如 URL 值 `"https://..."` 会被截断）。
- 建议: 抽一个共用的 `stripJsonComments` 到 `src/util/`（或复用 upstream 已有的 JSONC 解析工具），四处统一引用。正则版尤其要替换。

---

## D. 风格 / 一致性 / 类型安全

### D1. `src/util/backup.ts` 大量 `any`【中】
- 第 70、115、124、181、227、396、511 行等多处 `any`（`deepMerge(target: any, source: any)`、`maskSensitivePropertiesRecursive(obj: any)`、`catch (e: any)` 等）。
- AGENTS.md 明确"Avoid using the `any` type"。
- 建议: `deepMerge` 用泛型 / `Record<string, unknown>`；`catch (e)` 现代 TS 不需要标注 `any`，直接 `catch (e)` 即可（unknown 默认）。

### D2. `src/model-select.ts` `cfg as any` / `provider as any`【中】
- 第 30、32 行 `JSON.parse(text) as any` 和 `(provider as any).models`。
- 建议: 定义最小 schema 类型或用 `Schema.decodeUnknownOption`，至少用 `Record<string, { models?: Record<string, unknown> }>` 代替 `any`。

### D3. `src/root-components.ts` `(target as any)`【低】
- 第 17 行 `(target as any).OPENCODE_TUI_ROOT_COMPONENTS = ...`，而上面已经 `declare global` 了 `OPENCODE_TUI_ROOT_COMPONENTS`。
- 建议: 用 `target.OPENCODE_TUI_ROOT_COMPONENTS`（globalThis 已声明），避免 `as any`。

---

## E. 大文件 any 清理

本次对大文件做了 `any` 类型清理（逻辑深度审查中的 SolidJS onCleanup / 订阅清理 / upstream 同步仍属长期债务，见末尾"遗留"）。

### E1. `src/feature/vim-mode.tsx`【完成】
- 6 处 `dialog: any` → `dialog: DialogContext`（新增 `import type { DialogContext } from "@tui/ui/dialog"`）
- 6 处 `catch (e: any)` → `catch (e)` + 顶部新增 `errorMessage(e)` helper
- 2 处 `isSeparator(item as any)) as (LeaderLeaf | LeaderGroup)[]` → 放宽 `isSeparator` 签名到 `LeaderItem` 联合（同步改 `leader-menu.ts`，新增 `export type LeaderItem`），去掉 `as any` 和冗余 `as` 断言
- 2 处 `runLazyVim(rendererInstance: any)` → `ReturnType<typeof useRenderer>`
- `scrollRef: Accessor<any>` → `Accessor<ScrollBoxRenderable | undefined>`
- `(globalThis as any).__SKILL_FILTER__` → `declare global { var __SKILL_FILTER__: string | undefined }`，`prompt.tsx` 两处同步改用声明
- 调用 `runLeaderLeaf(selected)` 处补 `as LeaderLeaf`（`selectableItems` 已过滤 separator，不变量由 filter 保证）

### E2. `src/routes/session.tsx`【完成】
- 5 处 `part as any` → `part as TextPart` / `part as ReasoningPart` / `part as ToolPart`（新增 import `TextPart`/`ReasoningPart`）。Solid 的 `Match when` 不做类型窄化，故用 `Extract` 对应的具名类型 cast 代替 `as any`。
- `let scroll: any` → `let scroll: ScrollBoxRenderable | undefined`（新增 import `type ScrollBoxRenderable`），闭包内先绑定 `currentScroll` 再读取坐标，避免非空断言。

### E3. `src/feature/copy-mode.ts`【完成】
- 新增 `CopyNode` 结构类型（覆盖 `id`/`y`/`height`/`plainText`/`lineInfo`/`gutter`/`_positionType`/`_y`/`getChildren`），替换 `result: any[]`、`visit(node: any)`、`findRenderables(node: any, ...)` 及其返回类型、`childById` 的 `Map<string, any>`、`copyLine(row, child: any)`、3 处 `rowText`/`copyMin`/`rowPadded` 的 cache 参数
- `scroll.getChildren()` 通过 `as unknown as CopyNode[]` 转换（`Renderable` 的 protected 成员不直接兼容）

### E4. `src/component/dialog-quick-model.tsx`【完成】
- `dialog: any` → `DialogContext`
- `let searchInput: any` → `TextareaRenderable | undefined`，`ref={(r: any) => ...}` → `ref={(r: TextareaRenderable) => ...}`
- `(info as any)?.name` → `info?.name`（SDK 类型本身就有 `name?: string`）

### E5. `src/component/simple-tool.tsx`【完成】
- `ToolBlock`/`DetailLine` 的 `children: any` → `JSX.Element`（新增 `type JSX` import）
- `Diagnostics` 的 `diagnostics: any[]` → `Diagnostic[]`（新增 `type Diagnostic = { severity?: string; message?: string }`），调用处 `metadata().diagnostics` 补 `as Diagnostic[]`
- 保留 2 处 `Record<string, any>`（`input()` / `metadata()`）：tool state 来自 SDK 且各工具字段不同，约 30 个访问点都按结构化读取，改 `unknown` 只增加 narrowing 噪音无安全收益，属合理受控例外

### E 组遗留（长期债务，本次未做）
- SolidJS `onCleanup` / `createEffect` 依赖项 / 订阅取消的逐文件审计（prompt.tsx 等的 setTimeout 多数是 UI 通知计时器，setSignal 在卸载后触发无害；真正需要查的是 event listener / interval）
- upstream-derived 文件（session.tsx / prompt.tsx / minimal-layout.tsx / upstream/*）与 upstream 修复的同步状态
- `sdk/install-*` patch 的热重载安全（C3 已加幂等，但多入口重复加载未压测）

---

## 清理进度

逐行清理按上面 A → B → C → D → E 的顺序推进，每条处理完后在此勾选。

- [x] A1 删除 `recent-sessions.tsx`
- [x] A2 删除 `test_ansi.ts` / `test_ansi2.ts` / `test_buffer.ts`
- [x] A3 删除 `subagent-demo.ts` + `package.json` demo script
- [x] A4 删除 `locale.ts` 的 `time` / `datetime`
- [x] A5 放弃（别名解析顺序冲突，保持相对路径）
- [x] A6 保留最小 `assets.d.ts` wasm 声明，删除 wav/mp3 声明
- [x] B1 删除 `vim-mode.tsx` 两处 `/tmp/quick-model-debug.log` 调试日志
- [x] B2 `quick-model.ts` 用 `unlinkSync` 代替 `require("node:fs")`
- [x] C1 `model-select.ts` 重写为 `new Promise` + 显式 resolve（修非 TTY bug）
- [x] C2 `vim-mode.tsx` 两处 `loadQuickModelConfig()` 补 `directory()` 参数
- [x] C3 删除不可行的 SDK ESM monkey patch，避免启动崩溃
- [x] C4 `leader-menu.ts` `binaryExists` 防注入 + 用 `command -v`
- [x] C5 抽公共 `src/util/jsonc.ts`（`stripJsonComments` + `parseJsonc`），替换四处
- [x] D1 `backup.ts` 去 `any`（含 `BackupPayload` 类型 + `errorMessage` helper）
- [x] D2 `model-select.ts` 去 `any`（`ConfigShape` / `Keypress` 类型）
- [x] D3 `root-components.ts` 去 `as any`
- [x] E1 `vim-mode.tsx` 去 `any`（dialog / catch / isSeparator / renderer / globalThis / scrollRef）
- [x] E2 `session.tsx` 去 `any`（part / scroll）
- [x] E3 `copy-mode.ts` 去 `any`（CopyNode 结构类型）
- [x] E4 `dialog-quick-model.tsx` 去 `any`（dialog / searchInput / info）
- [x] E5 `simple-tool.tsx` 去 `any`（children / diagnostics，保留 2 处合理 Record<string, any>）

最终验证：`bun typecheck` 通过、`bun test` 9 pass / 0 fail。全包 `rg ": any|as any|any\[\]"` 零残留（除上述 2 处受控例外）。
