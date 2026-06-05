# [202606052006]_upstream-conflict-risk-map

## Why

这次 upstream sync 后，fork 里原本一部分 minimal/Vim TUI 行为还放在 upstream 代码区，后续每次合 `upstream/dev` 都容易发生冲突。已经把一批可以 fork-own 的改动移回 `packages/opencode-vim/`，但仍有少量 upstream seam 不能完全消掉。

这份文档记录当前还可能冲突的位置，以及后续遇到冲突时应该怎么判断保留哪边。

## Current High-Risk Upstream Files

### `packages/opencode/src/cli/cmd/tui/app.tsx`

用途：
- 允许 `opencode-vim` 在启动 upstream TUI 前注入 fork 自己的 Home/Session root component。
- 读取 `OPENCODE_MINIMAL_*` 环境变量，设置 minimal screen mode、footer height、stdout capture。
- minimal 模式下跳过 update check。

为什么容易冲突：
- upstream TUI app 是高频变动入口。
- 这里改的是 renderer config 和 route root render，都是 upstream 后续重构最可能碰到的位置。

处理原则：
- 如果冲突在普通 upstream UI/layout 逻辑，优先采用 upstream。
- 保留最薄的 fork seam：`OPENCODE_TUI_ROOT_COMPONENTS` 注入和 `OPENCODE_MINIMAL_*` renderer config。
- 不要把更多 Vim TUI 行为塞回这里；能放 `packages/opencode-vim/src/root-components.ts` 或 `runtime.ts` 的都放 fork 包。

### `packages/opencode/src/cli/cmd/tui/context/theme.tsx`

用途：
- minimal 模式下把 TUI background 解析为 transparent。
- 修正 selected item text fallback，避免透明背景下选中项不可见。

为什么容易冲突：
- upstream theme resolver 后续可能继续改 token、fallback、theme v2 行为。

处理原则：
- 冲突时先保留 upstream resolver 的结构。
- 只保留 minimal mode 的透明背景判断和 selected text fallback。
- 如果未来 fork theme 能完全通过 theme json 表达，应优先删掉这里的 fork 判断。

### `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

用途：
- 目前只需要导出 `context`，让 `packages/opencode-vim/src/upstream/session.ts` 可以复用 upstream SessionContext。

已降低的冲突面：
- `sessionBindingCommands` 已复制到 fork adapter，不再要求 upstream export。
- `useSession()` 已在 fork adapter 中用 `useContext(SessionContext)` 实现，不再要求 upstream export `use()`。
- Sidebar compact/bare 版本已移到 `packages/opencode-vim/src/component/sidebar.tsx`。

为什么仍容易冲突：
- upstream session route 很大，且经常改 message render、permission/question、sidebar、keybind。
- `context` 是内部 symbol，上游随时可能改名或改变 value shape。

处理原则：
- 如果 upstream 改了 context shape，先让 `packages/opencode-vim/src/routes/session.tsx` 的 Provider value 对齐。
- 不要重新要求 upstream export `sessionBindingCommands` 或 `use()`，除非确实无法在 fork adapter 内维护。
- 如果冲突很大，优先考虑把更多 session-only组件复制进 `packages/opencode-vim/`，而不是扩大 upstream export 面。

## Medium-Risk Upstream Files

### `packages/opencode/src/server/routes/instance/httpapi/handlers/config.ts`

用途：
- 当 config 里显式设置了 `model` 时，让 config providers API 返回该 model 作为 default。

风险：
- upstream provider/default model API 可能调整返回结构。

处理原则：
- 保留 upstream provider list 逻辑。
- fork 只保留“config.model overrides default response”的小分支。

### `packages/opencode/src/session/processor.ts`

用途：
- permission 被 reject 时不把 session 长期 blocked，允许用户继续交互。

风险：
- upstream session processor、tool settlement、permission/question error flow 变化时容易冲突。

处理原则：
- question reject 仍按 upstream 行为。
- permission reject 只清 `ctx.blocked`，不要扩大到其他错误类型。
- 如果 upstream 引入正式配置项或等价行为，优先删除 fork patch。

### `packages/opencode/src/tool/edit.ts`

用途：
- edit tool 成功输出里附带 diff。

风险：
- upstream edit tool 输出格式和 diagnostics flow 变化时可能冲突。

处理原则：
- 如果冲突，优先保留 upstream apply/diagnostics 逻辑。
- fork 只在成功 message 后追加 diff；不要改 edit apply 核心路径。
- 如果 `packages/opencode-vim` 能在 UI 层展示 diff，就应该删除这个 upstream patch。

### `packages/opencode/src/util/locale.ts`

用途：
- 调整时间格式显示。

风险：
- 低，但这是全局 util，不是 Vim TUI 专属。

处理原则：
- 如果 upstream 改 locale/time，优先采用 upstream。
- 能在 fork UI 层格式化时，应删除这里的 fork patch。

## Root / Dependency Conflict Points

### `package.json` and `bun.lock`

用途：
- 注册 `packages/miniapps/*` workspace。
- 增加 fork package / patch dependency wiring。

为什么容易冲突：
- upstream 依赖和 workspace 经常变。
- lockfile 是常见冲突点。

处理原则：
- 先保留 upstream dependency version changes。
- 再重新确认 fork workspace entries 仍在：`packages/opencode-vim`, `packages/miniapps/*`, `packages/bedrock-scanner`。
- 跑 `bun install --lockfile-only` 重新生成 lockfile，再跑 `cd packages/opencode-vim && bun typecheck && bun test`。

## Fork-Owned Areas

这些目录应继续保持 fork-owned，冲突时默认保留 fork 侧，除非明确要吸收 upstream 新功能：

- `fork/**`
- `packages/opencode-vim/**`
- `packages/miniapps/**`
- `packages/bedrock-scanner/**`
- `.oc/**`
- `patches/**`

## Recently Moved Out Of Upstream

以下改动已经从 upstream 区域移走或恢复为 upstream 版本，后续不应再在这些 upstream 文件里加 fork-only 行为：

- `packages/opencode/src/cli/cmd/cli.ts`
- `packages/opencode/src/cli/cmd/model-select.ts`
- `packages/opencode/src/cli/cmd/tui/component/dialog-skill.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx`
- `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

对应 fork-owned 实现现在位于：

- `packages/opencode-vim/src/cli.ts`
- `packages/opencode-vim/src/model-select.ts`
- `packages/opencode-vim/src/component/dialog-skill.tsx`
- `packages/opencode-vim/src/component/sidebar.tsx`
- `packages/opencode-vim/src/component/prompt.tsx`
- `packages/opencode-vim/src/component/autocomplete.tsx`

## Lessons Learned

- 冲突标签如果是 `Updated upstream` / `Stashed changes`，通常是 `fork/update.sh` 更新完成后恢复 stash 时撞到，不一定是 merge commit 本身的冲突。
- 能放到 `packages/opencode-vim/` 的行为不要留在 `packages/opencode/src/**`。
- 对 upstream 的 patch 越薄越好：保留入口 seam，具体行为下沉到 fork package。
- `packages/opencode-vim/src/upstream/**` 是 fork 与 upstream TUI 内部交互的 adapter 边界；组件不要直接到处 import upstream route internals。
- 每次 sync 后至少跑：
  - `cd packages/opencode-vim && bun typecheck`
  - `cd packages/opencode-vim && bun test`
  - `bash fork/build.sh`
