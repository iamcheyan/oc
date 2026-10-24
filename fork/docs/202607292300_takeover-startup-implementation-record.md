# [202607292300] 接管启动实施记录

> 日期：2026-07-29
> 分支：`fork-clean-queue`
> 前置文档：`202607292224_upstream-conflict-reduction-roadmap.md`（方案 B / Phase 1+2）

## 结果

| 指标 | 之前 | 之后 |
|------|------|------|
| `packages/tui/src/` diff vs upstream | 41 行 seam | **0** |
| `packages/opencode/src/` diff vs upstream | 5 行 seam | **0** |
| seam marker 总数 | 6 | **0** |
| allowlist 文件数 | 2 | **0** |
| 上游源码热文件 diff | 2 文件 | **0 文件** |

```text
git diff upstream/dev -- packages/tui/src/ packages/opencode/src/
→ (empty)
```

## 架构变化

```text
之前:
  minimal.ts → TuiThreadCommand.handler → app.tsx (4 处 FORK-SEAM)
                                     → processor.ts (1 处 FORK-SEAM)

之后:
  minimal.ts → createThreadTransport()     ← fork 自有 transport (thread-transport.ts)
            → runVimTui()                   ← fork 自有启动壳 (run.tsx)
              → renderer + 20 层 Provider 树
              → VimApp                      ← fork 自有 App 壳
                → MinimalHome / MinimalSession (直接渲染)
```

## 新增文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `opencode-vim/src/run.tsx` | ~1086 | `runVimTui`（run + Provider 树）+ `VimApp`（App 壳 + 命令注册 + 事件处理） |
| `opencode-vim/src/thread-transport.ts` | ~197 | `createThreadTransport`（worker + RPC + transport + validateSession） |

## 修改文件

| 文件 | 变化 |
|------|------|
| `opencode-vim/src/minimal.ts` | handler 改为 `createThreadTransport` + `runVimTui`，不再调 `TuiThreadCommand.handler` |
| `opencode-vim/src/root-components.ts` | 删除 `globalThis.OPENCODE_TUI_ROOT_COMPONENTS` 注入，只保留 CJK patch + theme |
| `opencode-vim/package.json` | 新增 `effect`、`open` 依赖 |
| `packages/tui/src/app.tsx` | 还原为 upstream 原样（删除全部 4 处 FORK-SEAM） |
| `packages/opencode/src/session/processor.ts` | 还原为 upstream 原样（deny 后停一轮，不再强制继续） |
| `fork/check-upstream-seams.sh` | 新增 seam marker 预算门禁；预算从 6 降至 0；允许空 allowlist |
| `fork/upstream-seams.allowlist` | 清空（0 文件） |
| `fork/update.sh` | `finish_rebase` 新增 `bun typecheck` 暴露 Provider API 漂移 |

## VimApp 保留的 App 职责

1. ready signal + plugin host start
2. args effect（`--model`/`--agent`/`--session` 初始化）
3. `--continue` / `--fork` 自动导航
4. 命令注册（leader menu 依赖的 `agent.list`、`theme.switch`、`session.new`、`session.list`、`provider.connect` 等）
5. 事件处理（`tui.command.execute`、`tui.toast.show`、`tui.session.select`、`session.deleted`、`session.error`）
6. terminal title、selection copy、plugin route
7. 路由 Switch → `MinimalHome` / `MinimalSession` 直接渲染

## VimApp 删除的 App 职责

- `installation.update-available` 事件订阅（fork 不做更新提示）
- `globalThis.OPENCODE_TUI_ROOT_COMPONENTS` 注入点
- `OPENCODE_MINIMAL_*` env 读取从 app.tsx 搬到 runVimTui（行为不变，位置变了）

## 行为变化

**权限拒绝（deny）**：之前 fork 强制 `ctx.blocked = false`（deny 后继续），现在跟上游一致——`ctx.blocked = ctx.shouldBreak`（deny 后停一轮，用户重新发消息继续）。

## rebase 体验变化

```text
之前: git rebase → 卡在 app.tsx 文本冲突 → 手撕 → 可能二次冲突
之后: git rebase → 跑完（无源码冲突）→ bun install → bun typecheck
      → 有错？修几行 Provider API 漂移 → 没错？push
```

## commit 列表

```
54234ff feat(fork): add typecheck to post-rebase validation for API drift
4fc1e0c refactor(opencode): adopt upstream permission reject behavior, eliminate last seam
e786b4a chore(fork): drop app.tsx from seam allowlist and clean root-components
d3af08f refactor(tui): remove fork seams from app.tsx
ed0fb9a refactor(opencode-vim): wire minimal entry to fork-owned startup
4cc28c6 feat(opencode-vim): add fork-owned TUI startup shell
d103a64 feat(opencode-vim): add fork-owned thread transport
1966b34 feat(fork): add seam marker budget gate
3c6d07c docs(fork): add upstream conflict roadmap and takeover startup plan
```

## 后续维护

- 上游改 Provider/Context API → `bun typecheck` 暴露编译错误 → 修 `run.tsx` 中的对应行
- 上游改 App 命令/事件 → 同上
- 上游改 worker/RPC 协议 → build + smoke test 暴露运行时错误 → 修 `thread-transport.ts`
- seam 预算 = 0：任何新 FORK-SEAM marker 会被 CI 门禁拦截