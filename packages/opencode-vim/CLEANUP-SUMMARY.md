# opencode-vim 包审查与清理总结

> 日期: 2026-07-16
> 范围: `packages/opencode-vim/**`
> 结果: `bun typecheck` 通过、`bun test` 9 pass / 0 fail，全包 `any` 零残留（2 处受控例外）

## 一、为什么这么做

这个包是我们 fork 自己维护的 Vim TUI 前端，搞了很长时间，从来没系统 review 过。随着功能越堆越多（leader 菜单、quick-model、备份/还原、CJK overlay patch、api-test、copy-mode……），几个问题开始累积：

1. **死代码噪声大**：调试脚本、孤儿组件、死导出散落各处，读代码时不断遇到"这玩意还在用吗"的疑问，拖慢理解。
2. **调试代码泄漏进生产路径**：`/tmp/quick-model-debug.log` 这种临时排查日志留在 leader 菜单的热路径里，既污染用户 `/tmp` 也暴露内部状态。
3. **潜伏的真实 bug**：`model-select` 在非 TTY 下会立即返回"取消"；`loadQuickModelConfig` 漏传 `directory()` 导致本地配置迁移路径是死的；`install-patches` 试图覆写 ESM namespace export，运行时会直接崩溃。
4. **类型安全退化**：全包散布 `any` / `as any`，削弱了 typecheck 本该提供的防护，也违反 AGENTS.md 的明确约定。
5. **重复实现**：`stripJsonComments` 在三个文件里各抄一份（约 55 行 × 3），quick-model 又用了一份会误删 URL 里 `//` 的正则版。

这些问题单个都不致命，但放一起就是技术债的复利。趁还没更糟，做一次完整 pass：先建审查文档（REVIEW.md）把所有发现固化下来，再逐条清理、每步验证、最后总结。

## 二、做了哪些东西

按 A（死代码）→ B（调试代码）→ C（bug）→ D（类型安全）→ E（大文件 any）五组推进，共 21 条，全部完成。

### A 组：死代码 / 孤儿文件（6 条）
- 删除 `src/component/recent-sessions.tsx`（零引用组件，67 行）
- 删除根目录 `test_ansi.ts` / `test_ansi2.ts` / `test_buffer.ts`（CJK overlay 开发期调试脚本，不被 test 收集）
- 删除 `src/subagent-demo.ts` + `package.json` 的 `demo:subagent` script（纯 stdout 实验 demo，171 行）
- 删除 `locale.ts` 里没人用的 `time()` / `datetime()`
- 精简 `assets.d.ts`：删除未使用的 wav/mp3 声明，保留 `*.wasm`（`opencode` 源码经 path fallback 引入时需要）
- A5 放弃：本想把 `locale.ts` 的相对路径改 `@/util/locale` 别名，但 tsconfig 别名解析顺序 `["./src/*", "../opencode/src/*"]` 会导致自引用循环，20 个 typecheck 错误，故保持相对路径并记录原因

### B 组：调试代码（2 条）
- 删除 `vim-mode.tsx` 两处 `appendFileSync("/tmp/quick-model-debug.log", ...)`（4 行 + 注释）
- `quick-model.ts` 迁移逻辑里 `require("node:fs").unlinkSync` → 顶部 import 的 `unlinkSync`（ESM 风格一致）

### C 组：bug（5 条）
- `model-select.ts`：把 `setInterval` 轮询 `process.stdin.isRaw` 改成 `new Promise` + 显式 `resolve`，修掉非 TTY 下立即返回"取消"的竞态；同时加非 TTY 早退提示
- `vim-mode.tsx` 两处 `loadQuickModelConfig()` 补 `directory()` 参数，让本地 `.oc/quick-model.jsonc` 迁移分支不再永远是死路径
- 删除不可行的 SDK monkey patch：`install-patches.ts` 覆写 `Sdk.createOpencodeClient` 在 Bun/ESM 下会报只读属性错误；同步删除孤儿 `patch-config-providers.ts`、只剩测试引用的 `config-model-default.ts`、对应测试和入口副作用 import
- `leader-menu.ts` `binaryExists`：加 `/^[a-zA-Z0-9_.-]+$/` 白名单防命令注入，`which` → `command -v`（更可移植）
- 抽公共 `src/util/jsonc.ts`（`stripJsonComments` + `parseJsonc`），替换 `vim.ts`/`leader-menu.ts`/`backup.ts` 三份手抄副本，以及 `quick-model.ts` 会误删 URL 内 `//` 的正则版

### D 组：类型安全（3 条）
- `backup.ts`：`deepMerge`/`maskSensitivePropertiesRecursive`/`mergedConfig` 去 `any`（改 `Record<string, unknown>`），3 处 `catch (e: any)` → `catch (e)` + 新增 `errorMessage(e)` helper，`JSON.parse` 结果补 `BackupPayload` 类型，去掉 `content as string` 冗余断言
- `model-select.ts`：`JSON.parse(text) as any` → `ConfigShape`，`(provider as any).models` → 正类型，`onKey(str, key: any)` → `Keypress`
- `root-components.ts`：`(target as any).OPENCODE_TUI_ROOT_COMPONENTS` → `target.OPENCODE_TUI_ROOT_COMPONENTS`（已有 `declare global`）

### E 组：大文件 any 清理（5 条）
- `vim-mode.tsx`：6 处 `dialog: any` → `DialogContext`；6 处 `catch (e: any)` → `errorMessage(e)`；放宽 `isSeparator` 签名到 `LeaderItem` 联合去掉 `as any`；`runLazyVim(rendererInstance: any)` → `ReturnType<typeof useRenderer>`；`scrollRef: Accessor<any>` → `Accessor<ScrollBoxRenderable | undefined>`；`(globalThis as any).__SKILL_FILTER__` → `declare global` 声明（`prompt.tsx` 两处同步改）
- `session.tsx`：5 处 `part as any` → `TextPart`/`ReasoningPart`/`ToolPart`；`let scroll: any` → `ScrollBoxRenderable | undefined`
- `copy-mode.ts`：新增 `CopyNode` 结构类型替换 5 处 `any`（node/result/cache/child）
- `dialog-quick-model.tsx`：`dialog: any` → `DialogContext`；`searchInput: any` → `TextareaRenderable`；`(info as any)?.name` → `info?.name`
- `simple-tool.tsx`：`children: any` → `JSX.Element`；`diagnostics: any[]` → `Diagnostic[]`；保留 2 处 `Record<string, any>`（tool state 来自 SDK 且字段异构，约 30 个访问点按结构化读，改 `unknown` 只增噪音无收益——合理受控例外）

### 新增文件
- `src/util/jsonc.ts`：共享的 JSONC 解析工具（`stripJsonComments` + `parseJsonc`）

### 删除文件
- `src/component/recent-sessions.tsx`、`src/subagent-demo.ts`、`test_ansi.ts`、`test_ansi2.ts`、`test_buffer.ts`

### 文档
- `REVIEW.md`：完整审查记录 + 逐条勾选表
- `CLEANUP-SUMMARY.md`：本文

## 三、感想

**先说过程**：这次最大的教训是我自己——你一开始就说要去睡觉、让我一口气干完别再回来问，但我前几轮反复被"agent 步数上限"打断，每次都把"下一步"抛回给你，搞得你第二天还得催好几次。本质上是我在用"汇报进度"代替"完成任务"，把中断当成了安全出口。正确的做法是：即便被打断，也该把当前文件改到能 typecheck 通过的稳定点，而不是停在半截丢回一堆"待办"。后面几轮我调整成"改完一个文件就 typecheck、绿了再继续下一个"的节奏，才真正跑完。

**再说说代码本身**：这个包的问题很典型——不是一个地方写崩了，而是"长期没人系统看"导致的均匀老化。每处问题单独看都情有可原：调试日志是当时排查 slot 映射加的、`as any` 是 SolidJS `Match when` 不做类型窄化的无奈之举、`stripJsonComments` 抄三份是因为先后三个配置功能各自加的、`loadQuickModelConfig()` 漏传参数是因为签名后来才加了可选的 `_projectDir`。没有任何一处是"偷懒"，全是"当时合理、事后失修"。

所以这次清理的价值不在"修了几个 bug"，而在**把隐形的约定显性化**：
- `install-cjk-safe-overlay.ts` 的 `Symbol.for` 幂等让"CJK overlay patch 只装一次"从口头约定变成运行时保证
- `jsonc.ts` 让"JSONC 解析"从四处各写一份变成一个有名字的公共能力
- `DialogContext`/`ScrollBoxRenderable`/`CopyNode` 这些类型让组件契约从注释里的描述变成 typecheck 能查的边界
- REVIEW.md 让"哪些是 fork 拷贝、哪些是 upstream 适配、哪些是死代码"从脑内记忆变成可查文档

**没做完的诚实交代**：E 组只清了 `any`，真正的逻辑深度审计（SolidJS `onCleanup`/订阅取消/upstream 同步状态）没做，REVIEW.md 里标成了长期债务。那些 `setTimeout` 多数是 UI 通知计时器，卸载后 setSignal 无害，但 event listener / interval 那类需要逐个核对的，我没碰。这是诚实的边界——与其假装审完了，不如标清楚还欠什么。

**一句话总结**：这次 review 把一个"能跑但没人敢动"的包，推进到了"改之前能查、改之后能验、类型能挡住大部分回归"的状态。剩下的逻辑债务是另一场仗，但至少战场地图现在是清楚的。
