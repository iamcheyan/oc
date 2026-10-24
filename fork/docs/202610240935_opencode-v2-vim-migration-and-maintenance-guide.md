# [202610240935]_opencode-v2-vim-migration-and-maintenance-guide

本文档记录了将 `opencode-vim` 完整迁移并适配到上游 **OpenCode 2 (`v2.1.4+`)** 架构的全过程、核心修复点，以及后续**如何开发修改 Vim 功能**与**如何低冲突跟随上游 (`upstream/dev`) 同步**的最新完整指南。

---

## 1. 为什么要这么做 (Why)

随着上游从 OpenCode 1.x 升级到 **OpenCode 2 (`v2.1.4`)**，仓库的包结构和 TUI 基础设施发生了根本性重构：
1. **包结构拆分**：原 `packages/opencode` 中的 CLI 入口与 TUI 前端被拆分为独立的 `packages/cli` 和 `packages/tui`。
2. **TUI API 全面升级**：
   - 命令面板注册字段从 `name` 改为必传的 `id`（否则抛出 `Error: Palette commands require an ID`）。
   - 键盘绑定从 V1 的 `useBindings` 全面迁移到基于 Layer 的 `Keymap.createLayer({ id, description, mode, bindings })`。
   - 弹窗上下文从 `DialogProvider` 改为 `DialogIntegration`。
   - 顶部/底部新增了 `SessionTabs`、`DevToolsBar`、`DialogHighlights` 以及 `<Slot name="home_prompt" mode="replace">` 插件插槽机制。
3. **之前同步过程中的遗留问题**：
   - `packages/opencode-vim/src/root-components.ts` 在合并中被删，导致启动时根本没有注册 `OPENCODE_TUI_ROOT_COMPONENTS`，TUI 直接渲染了上游原生界面，Vim 模式完全失效。
   - `fork/docs/` 下的历史设计文档、`fork/README.md`、`fork/AGENTS.root.md` 以及带完整平台检测与冒烟测试的 `fork/build.sh` 在历史整理提交中被误删或简化成了空壳。
   - `/` 命令自动补全弹窗 (`Autocomplete`) 因挂载在全屏根级 `AutocompleteHostProvider` 下，沿用旧版 `anchor.parent` 坐标相减导致 `y = 0`（菜单跑到屏幕最顶部且上下键不响应）。

---

## 2. 这么做的好处 (Benefits)

1. **单接缝 (Single-Seam) 零侵入架构**：
   - 整个上游代码库中，**只有 `packages/tui/src/app.tsx` 一个文件**包含 `FORK-SEAM (opencode-vim)` 标记（仅约 15 行代码），由 `bash fork/check-upstream-seams.sh` 严格守护。
   - 不需要修改上游 `packages/cli/tsconfig.json` 或 `packages/tui/tsconfig.json` 的任何路径别名。
2. **单一 SolidJS 模块图 (Single Module Graph)**：
   - `packages/opencode-vim/src/**` 通过相对路径（如 `../../tui/src/context/data`）直接引用 `packages/tui/src/**`，确保在 `bun test`、`bun typecheck` 以及 `packages/cli` 单文件二进制编译时，宿主与 Vim 组件共享同一个 SolidJS Context 实例，彻底杜绝双实例 Context 丢失问题。
3. **100% 恢复历史文档与一键构建工具链**：
   - 找回了 `fork/docs/` 全部 30+ 篇历史架构与排障文档、`fork/README.md`、`fork/AGENTS.root.md`、`fork/static/screenshot.jpeg`。
   - 升级了 `fork/build.sh`，一键完成依赖安装、插件构建、接缝检查、CLI 单文件二进制编译、打包输出到 `fork/dist/opencode-<os>-<arch>/bin/{opencode,opencode-vim}` 以及双二进制冒烟测试。

---

## 3. 改了哪些东西 (What Changed)

### 3.1 根组件接管与唯一上游接缝 (`packages/tui/src/app.tsx` & `packages/opencode-vim/src/root-components.ts`)
- 恢复并完善 [`packages/opencode-vim/src/root-components.ts`](../../packages/opencode-vim/src/root-components.ts)：
  - `installMinimalRootComponents()` 将 `{ Home: MinimalHome, Session: MinimalSession }` 注册到 `globalThis.OPENCODE_TUI_ROOT_COMPONENTS`。
- 在 [`packages/tui/src/app.tsx`](../../packages/tui/src/app.tsx) 的 `FORK-SEAM (opencode-vim)` 区域：
  - 模块初始化时调用 `installMinimalRootComponents()`。
  - 当检测到 `hasCustomRootComponents()` 为真时，使用 `MinimalHome` / `MinimalSession` 渲染路由，并隐藏上游默认的 `SessionTabs`、`DevToolsBar` 和 `DialogHighlights`，保证极简全屏 Vim 体验。

### 3.2 模块导入路径统一为相对路径 (`packages/opencode-vim/src/**`)
- 将 `packages/opencode-vim/src/**` 中所有遗留的 `@/*`、`@tui/*`、`@opencode-ai/api-test`、`bedrock-scanner` 别名替换为指向 `packages/tui/src/**` 和 `packages/miniapps/**`、`packages/bedrock-scanner/**` 的相对路径。
- 无需改动上游 `tsconfig.json`，`cd packages/opencode-vim && bun run typecheck` 与 `cd packages/tui && bun run typecheck` 均零错误通过。

### 3.3 OpenCode 2 运行时与组件适配 (`prompt.tsx`, `minimal-layout.tsx`, `dialog-model.tsx`, `home.tsx`, `session.tsx`)
- **修复 TDZ 初始化顺序 (`prompt.tsx`)**：将 `const data = useData()`、`const local = useLocal()` 等上下文 Hook 移至 `quickModelSlots = createMemo(...)` 之前，解决启动时 `ReferenceError: Cannot access 'fe' before initialization`。
- **修复命令注册 (`prompt.tsx`)**：将 `stashCommands` 的 `name:` 改为 OpenCode 2 要求的 `id:`。
- **移除上游 `<Slot>` 覆盖 (`minimal-layout.tsx`)**：移除 `MinimalHomePromptFooter` 和 `MinimalSessionPromptFooter` 外层的 `<Slot name="home_prompt" mode="replace">`，防止上游 `tui:core` 插件覆盖掉底部的 Vim 状态栏 (`INSERT` / `NORMAL` / `LEADER MENU`)。
- **适配 V2 Dialog & Keymap (`dialog-model.tsx`, `config/vim.ts`, `home.tsx`, `session.tsx`)**：
  - 使用 `DialogIntegration` 替代已废弃的 `DialogProvider`，使用 `Keymap.createLayer` 替代 `useBindings`。
  - 为 `config/vim.ts` 增加响应式信号，确保 `pureMode`、`hideTools`、`autoAllowPermissions`、`hidePrompt`、`autoResume` 等设置在 UI 中实时生效。

### 3.4 修复 `/` 与 `@` 自动补全菜单位置与按键 (`packages/opencode-vim/src/component/autocomplete.tsx`)
- **坐标计算修复**：`Autocomplete` 渲染在全屏根部的 `AutocompleteHostProvider` 下。过去用 `anchor.y - anchor.parent.y` 会算出 `0`（因为 `anchor` 是其父容器的第一个子节点），导致菜单跑到屏幕最顶部 (`y = 0`)。现改为为 `Autocomplete` 外层 `<box>` 绑定 `ref={(r) => (container = r)}`，统一相对于 `container?.parent` 计算偏移量，并将高度上限夹紧在锚点上方可用空间内，菜单精准停靠在底部输入框正上方。
- **按键层迁移**：将自动补全的上下移动 (`up`/`down`/`ctrl+p`/`ctrl+n`)、确认 (`return`/`tab`)、关闭 (`escape`) 迁移到 `Keymap.createLayer({ id: "vim:autocomplete", mode: "autocomplete", bindings: ... })`。

---

## 4. 经验与教训 (Lessons Learned)

1. **绝不在 `packages/opencode-vim` 中使用 `@/*` 或 `@tui/*` 别名**：
   - 一旦使用路径别名，就必须污染上游 `packages/cli/tsconfig.json` 和 `packages/tui/tsconfig.json`，每次上游改动 tsconfig 都会冲突。使用相对路径既零冲突，又能保证 SolidJS Context 单实例。
2. **定位浮层坐标时必须以浮层自身所在的挂载容器 (`container.parent`) 为基准**：
   - 当 Portal / HostProvider 将组件渲染在根级节点时，`anchor.parent` 是局部容器而非全屏根容器，直接相减必然丢失局部容器在屏幕上的 `y` 坐标。
3. **所有代码变更必须通过 `check-upstream-seams.sh` 检查**：
   - 保持唯一接缝原则是长期维护 Fork 而不陷入合并泥潭的关键。

---

## 5. 以后如何修改 Vim 模式代码（开发指南）

### 5.1 核心代码目录地图 (`packages/opencode-vim/src/`)

| 功能模块 | 文件路径 | 说明 |
| --- | --- | --- |
| **根路由接管入口** | `packages/opencode-vim/src/root-components.ts` | 注册 `MinimalHome` 和 `MinimalSession` 到全局 `OPENCODE_TUI_ROOT_COMPONENTS` |
| **首页视图 (Home)** | `packages/opencode-vim/src/routes/home.tsx` | 启动首页、自动恢复会话 (`autoResume`)、首页 Leader 菜单动作 |
| **会话视图 (Session)** | `packages/opencode-vim/src/routes/session.tsx` | 紧凑消息流渲染、`j`/`k`/`gg`/`G` 滚动、`hideTools`/`pureMode`、权限自动允许 |
| **输入框与 Vim 状态机** | `packages/opencode-vim/src/component/prompt.tsx` | `INSERT` / `NORMAL` 模式切换 (`<Esc>`, `i`, `a`)、`<Space>` 呼出 Leader 菜单、快捷模型切换 |
| **斜杠 `/` 与 `@` 补全** | `packages/opencode-vim/src/component/autocomplete.tsx` | `/` 命令菜单与 `@` 文件补全弹窗的位置计算、过滤逻辑与键盘绑定 |
| **底部状态栏与 Leader 弹窗** | `packages/opencode-vim/src/component/minimal-layout.tsx` | 底部 `INSERT`/`NORMAL` 徽章、模型/Token 信息栏、右侧 `LEADER MENU` 面板 |
| **Leader 快捷键定义** | `packages/opencode-vim/src/vim/leader.ts` | 定义 `<Space>` 菜单下的分组与按键映射（如 `m` 切模型、`s` 会话、`v` Vim 设置等） |
| **Vim 持久化配置** | `packages/opencode-vim/src/config/vim.ts` | 读写 `~/.config/opencode/vim.json` 并提供 SolidJS 响应式触发 |
| **Vim 设置弹窗** | `packages/opencode-vim/src/component/dialog-vim-settings.tsx` | 交互式开关 `pureMode`、`hideTools`、`autoResume` 等配置 |

### 5.2 日常开发与调试流程

1. **修改代码后快速运行验证（无需完整编译二进制）**：
   ```bash
   bun run --cwd packages/cli src/index.ts
   ```
2. **运行单元测试与类型检查**：
   ```bash
   cd packages/opencode-vim
   bun test
   bun run typecheck
   ```
3. **检查上游接缝是否干净**：
   ```bash
   bash fork/check-upstream-seams.sh
   ```
4. **编译正式二进制并冒烟测试**：
   ```bash
   bash fork/build.sh
   ```
   编译产物位于：
   - `./fork/dist/opencode-linux-x64/bin/opencode-vim`
   - `./fork/dist/opencode-linux-x64/bin/opencode`
   - `./fork/dist/plugin/tui.js`

---

## 6. 以后如何跟随上游 (`upstream/dev`) 同步（同步指南）

### 6.1 一键同步流程

当需要拉取上游最新代码时，确保当前工作区干净（`git status` 无未提交修改），然后直接运行：

```bash
bash fork/update.sh
```

`fork/update.sh` 会自动完成以下工作：
1. `git fetch upstream` 获取上游最新提交。
2. 自动创建备份分支 `backup/main-before-upstream-YYYYMMDD-HHMMSS`（随时可回滚）。
3. 执行 `git rebase upstream/dev`。
4. 如果遇到 `bun.lock` 冲突，自动取上游版本并在 rebase 完成后执行 `bun install` 重新生成。

### 6.2 如果遇到代码冲突怎么处理？

因为我们采用了**单接缝架构**，99% 的情况下 `packages/opencode-vim/**` 不会与上游产生文件冲突。唯一可能冲突的文件是：
- `packages/tui/src/app.tsx`（唯一的上游接缝文件）

解决 `packages/tui/src/app.tsx` 冲突的黄金法则：
1. **以 `upstream/dev` 的新版 `app.tsx` 为基底**。
2. **保留两处 `// FORK-SEAM (opencode-vim):` 块**：
   - 顶部导入并调用 `installMinimalRootComponents()`（定义 `HomeComponent`、`SessionComponent` 和 `hasCustomRootComponents`）。
   - 渲染树中用 `<Dynamic component={HomeComponent()} />` / `<Dynamic component={SessionComponent()} />` 替代写死的 `<Home />` / `<Session />`，并用 `<Show when={!hasCustomRootComponents()}>` 包裹上游新增的顶栏/底栏装饰组件（如 `SessionTabs`、`DevToolsBar`）。

### 6.3 同步后的四步必检清单

每次同步完上游（或者上游重构了 `packages/tui` 的内部 Context API）后，按顺序执行以下四条命令：

```bash
# 第一步：确认没有意外修改任何非允许的上游文件
bash fork/check-upstream-seams.sh

# 第二步：确认 opencode-vim 测试与类型检查通过（若上游改了 Context API，typecheck 会直接精准报错到对应行）
cd packages/opencode-vim && bun test && bun run typecheck && cd ../..

# 第三步：确认 packages/tui 类型检查通过
cd packages/tui && bun run typecheck && cd ../..

# 第四步：编译插件与二进制并跑通冒烟测试
bash fork/build.sh
```

全部通过后，即可安全推送分支（`git push origin <branch> --force-with-lease`）。
