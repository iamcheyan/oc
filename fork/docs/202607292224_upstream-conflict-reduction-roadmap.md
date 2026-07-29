# [202607292224] 上游冲突收敛路线图

> 日期：2026-07-29  
> 分支上下文：`fork-clean-queue`（干净补丁队列）  
> 相关文档：
>
> - [`202606152140_rebase-maintenance-model.md`](./202606152140_rebase-maintenance-model.md)
> - [`202606052006_upstream-conflict-risk-map.md`](./202606052006_upstream-conflict-risk-map.md)
> - [`202605192230_upstream-conflict-reduction.md`](./202605192230_upstream-conflict-reduction.md)
> - [`202605191430_minimal-upstream-seams.md`](./202605191430_minimal-upstream-seams.md)

## 1. 目标

尽量 **不改上游源码**，把每次 `bash fork/update.sh` 的冲突从「几乎必撞」收敛到「大多无感」，并在长期路径上逼近：

```text
相对 upstream/dev 的上游热文件 diff → 0
```

本文件记录原因判断、可选方案、推荐阶段，以及明确 **不做什么**。  
这是策略文档，不是已实施清单。

---

## 2. 结论摘要

1. **主因不是 Vim 功能写太多**，而是仍有少量逻辑 **寄生在上游热文件** 上，再叠加历史补丁过碎、以及少数不必要的上游改动。
2. 主体已经隔离在 `packages/opencode-vim/**`；冲突贵在 **位置**，不在 **体量**。
3. 当前真正打进上游源码的只剩：
   - `packages/tui/src/app.tsx`（FORK-SEAM）
   - `packages/opencode/src/session/processor.ts`（FORK-SEAM）
   - 根 `package.json` / `bun.lock`（workspace，偏机械）
4. 想继续变少，方向应是：
   - **纪律**：禁止扩大 allowlist、保持短队列；
   - **架构**：自建 Vim TUI 启动壳，去掉对 `app.tsx` 的注入依赖；
   - **语义**：权限 reject 行为迁出 `processor.ts` 或向上游/产品取舍。

---

## 3. 现状盘点（2026-07-29）

### 3.1 启动路径（冲突的结构根）

```text
opencode-vim
  → applyMinimalModeDefaults()          // env：OPENCODE_MINIMAL_*
  → installMinimalRootComponents()      // globalThis.OPENCODE_TUI_ROOT_COMPONENTS
  → TuiThreadCommand.handler            // @opencode/cli/cmd/tui
  → packages/tui/src/app.tsx            // 必须在此读取注入与 env
```

只要还走 `TuiThreadCommand → App`，`app.tsx` 上的文本 seam **就无法从 git diff 中消失**。

### 3.2 仍在上游源码中的 seam

| 文件 | 机制 | 作用 |
|------|------|------|
| `packages/tui/src/app.tsx` | `OPENCODE_TUI_ROOT_COMPONENTS` | 替换 Home / Session 根组件 |
| 同上 | `OPENCODE_MINIMAL_*` → `createCliRenderer` | main-screen / footer 等嵌入模式 |
| 同上 | `OPENCODE_MINIMAL_DISABLE_UPDATE_CHECK` | 跳过安装更新提示 |
| `packages/opencode/src/session/processor.ts` | Permission reject → `ctx.blocked = false` | 拒绝权限后不掐死 Vim 工作流 |

Allowlist：`fork/upstream-seams.allowlist`（仅上述 2 路径）。

### 3.3 体量对比（干净队列）

在 `fork-clean-queue` 上相对 `upstream/dev` 的典型形态：

| 范围 | 量级 | 冲突贡献 |
|------|------|----------|
| 全部 fork 差异 | ~130 文件 / 上万行 | 多数在 fork 自有路径，**低** |
| 上游热文件 seam | ~2 文件 / ~40 行 | **高** |
| `package.json` + `bun.lock` | workspace + 生成物 | **几乎每次**，可脚本化 |

旧 `main` 另有「删除多语言 `README.*.md`」等 **非功能** 上游面，会额外制造冲突；干净队列已改为 **保留上游翻译 README**。

### 3.4 补丁队列形状

| 队列 | 约提交数 | 重放成本 |
|------|----------|----------|
| 旧 `main` | ~55 | 高：同 seam 被拆成多笔历史提交，易 drop / 二次冲突 |
| `fork-clean-queue` | ~6 | 低：职责切片清晰 |

干净队列示例切片：

1. `feat(tui): add minimal fork integration seams`
2. `feat(opencode-vim): add Vim TUI and companion packages`
3. `chore(fork): wire workspace packages and CI`
4. `chore(fork): add sync scripts, seams checker, and docs`
5. 测试 / gitignore 修正
6. `update.sh` 硬化（rebase 后强制 seam 检查）

---

## 4. 冲突公式（便于对齐预期）

```text
冲突频率 ≈
    上游热文件变更频率
  × 我们是否仍改这些文件
  × 补丁被拆成多少次重放
  + 不必要的上游改动（README 删除等）
  + lockfile 双边 regen（机械噪声）
```

可被我们控制的项：后四项。  
不可控但可隔离的项：上游热文件本身的演进速度。

**误判纠正**：

| 说法 | 判断 |
|------|------|
| 因为 Vim 功能太多所以冲突 | 基本不成立 |
| 因为还在改上游核心文件 | 成立 |
| 因为历史提交又多又碎 | 成立 |
| 因为改了不该改的上游文件 | 旧 main 成立 |

---

## 5. 可选方案

### 方案 A — 纪律型收敛（成本最低）

不改架构，把「自己制造的冲突」砍光。

**动作：**

- 以干净短队列作为发布分支基线（`fork-clean-queue` → 将来的 `main`）。
- allowlist 冻结为 2 文件；新增 fork 逻辑禁止进入 `packages/tui/**`、`packages/opencode/src/**`（除 seam）。
- 永不改上游 README 翻译、workflows、根 `AGENTS.md`。
- `bun.lock` 冲突一律视为生成物：取上游侧 + `bun install` 重生（`update.sh` 已部分支持）。
- rebase 成功后强制 `fork/check-upstream-seams.sh`（已写入 `update.sh`）。

**预期：**

- 冲突不会归零。
- 典型体验：lock 常见；seam 偶发。
- 上限仍受 `app.tsx` / `processor.ts` 制约。

**适用：** 立刻执行，作为一切后续工作的底线。

---

### 方案 B — 自建 Vim TUI 启动壳（去掉 app.tsx 依赖，收益最大）

**思路：** `opencode-vim` 自己拥有启动路径，**不再** 经 `TuiThreadCommand` 进入上游 `App`。

现状：

```ts
// packages/opencode-vim/src/minimal.ts（示意）
installMinimalRootComponents()
await TuiThreadCommand.handler(args)
```

目标：

```ts
// 示意：fork 自有入口
applyMinimalModeDefaults()
await runVimTui({
  Home: MinimalHome,
  Session: MinimalSession,
  // 自己 createCliRenderer({ screenMode, footerHeight, ... })
  // 自己组装 Provider 树；叶子能力尽量 import @tui/*
})
```

**可删除的 seam：**

| 现 FORK-SEAM | 自建壳之后 |
|--------------|------------|
| `OPENCODE_TUI_ROOT_COMPONENTS` | 直接渲染 fork 路由根 |
| `OPENCODE_MINIMAL_*` renderer 参数 | 自己传给 `createCliRenderer` |
| update-check skip | 不订阅 / 不处理安装更新 UI |

**代价：**

- 需要梳理并复用 Provider 树（SDK、Theme、Route、Dialog、Plugin、Keymap…）。
- 上游 context API 变更会变成 **fork 编译/类型错误**，而不是 git 文本冲突（维护税转移，但更可控、可测）。
- 工作量接近「抽出 app.tsx 的启动与壳层」，**不是** 重写整个 TUI。

**好处：**

- git 上 `packages/tui/**` 可与上游 **字节级一致**（除无关的生成物）。
- 原版 `opencode` 二进制可继续走上游 `app.tsx`；Vim 二进制走 fork 壳（`fork/build.sh` 已双入口）。

**建议落地阶段：**

1. 设计 `runVimTui` 最小壳：列出必须自有的节点 vs 可 `@tui/*` 复用的节点。
2. 并行跑通 home / session 主路径与 smoke。
3. 从 allowlist 删除 `packages/tui/src/app.tsx`，并删掉 `globalThis` 注入路径。
4. 文档与 seam 检查同步更新。

这是「尽量不改上游」路线里 **架构 ROI 最高** 的一步。

---

### 方案 C — 去掉 processor.ts seam

当前语义差：

```text
上游：Permission / Question reject → ctx.blocked = shouldBreak
fork：Permission reject           → ctx.blocked = false
```

| 子路径 | 说明 | 上游 diff |
|--------|------|-----------|
| C1 上游小 PR / 配置项 | 如 `permission.rejectContinuesSession` 或默认 continue | 若合入 → 0 |
| C2 官方 plugin / hook | 若存在可拦截点则迁出 processor | 0 |
| C3 产品取舍 | 接受 deny 后停一轮，UI 提示再发消息 | **立刻 0** |
| C4 暂留 | 仅数行，冲突频率通常低于 app.tsx | 保留 1 文件 |

权限语义比 UI 注入更「核心」；若体验可接受，**C3 是最快的零上游路径**。  
若体验不可降，优先 **C1**（产品向配置比 global hook 更好合）。

---

### 方案 D — 向上游贡献极小扩展点（长期，不可控）

前提：更大范围的 hook PR 曾不被接受。改策略为：

- **一次一个点**；
- **默认 no-op / 与现行为一致**；
- **可配置、有测试、不绑定 vim 品牌命名**。

候选示例（示意）：

```ts
// TuiInput 可选字段
root?: { Home?: Component; Session?: Component }
skipUpdatePrompt?: boolean
```

```jsonc
// opencode.json
{ "permission": { "rejectContinuesSession": true } }
```

或仅将已有 `OPENCODE_MINIMAL_*` env **文档化/官方化**（更小）。

**定位：** 与方案 B 并行试探；合入则锦上添花，不合入不阻塞自建壳。

---

### 方案 E — 不推荐作为主路径

| 做法 | 原因 |
|------|------|
| build 时 quilt/patch 上游文件 | git 树「看起来干净」，补丁应用冲突仍在，review 更难 |
| 继续把大块上游 UI 复制进 vim | 短期少文本冲突，长期双份 API 漂移（prompt 已在付税） |
| 拆 monorepo 外挂包以消灭 package.json diff | 能弱化 workspace 冲突，工程成本与发布模型代价过大 |

关于 **fork 内 UI 副本**（`prompt.tsx`、`session.tsx`、`simple-tool.tsx` 等）：

- 它们 **不产生** 与上游同路径的 git 冲突；
- 但产生 **行为/API 漂移维护税**。
- 收敛原则：能 `import` / re-export `@tui/*` 的不要整页复制；必须 fork 的集中在「交互差异真实存在」的表面。

---

## 6. 推荐阶段（路线图）

```text
Phase 0  纪律底线（立即）
         - 干净短队列成为主维护线
         - 冻结 allowlist = 2
         - 禁止新增上游路径改动
         - lock 自动化 + rebase 后 seam check
         预期：冲突 ≈ lock + 偶发 seam

Phase 1  自建 runVimTui 薄壳（高价值）
         - 去掉对 app.tsx 的全部 FORK-SEAM
         - packages/tui 与上游对齐（0 seam）
         预期：上游热文件最多剩 processor

Phase 2  processor 语义处理（可选）
         - C1 / C2 / C3 择一
         预期：上游源码 diff → 0（仅余 workspace/lock）

Phase 3  上游微 hook（并行、非阻塞）
         - 极小 PR 试水
```

### 量化预期

| 阶段 | 上游源码 diff（热文件） | 典型 rebase |
|------|-------------------------|-------------|
| 现在（干净队列 + 2 seam） | 2 文件 ~40 行 | lock 常见；seam 偶发 |
| Phase 1 后 | 0～1 文件 | 大多只 regen lock |
| Phase 2 若去掉 processor | **0 文件** | 仅 workspace/lock |

说明：`package.json` workspace 一行与 `bun.lock` 在 monorepo 内几乎不可避免；应视为 **可自动处理的噪声**，不要与 seam 混谈。

---

## 7. 过程纪律（长期有效）

1. **新功能只进** `packages/opencode-vim/**`、`fork/**`、明确的 companion 包。  
2. **改 seam 文件必须**：
   - 保持 `FORK-SEAM (opencode-vim)` 标记；
   - 以上游结构为主体，最小植入；
   - 跑 `bash fork/check-upstream-seams.sh`。  
3. **禁止** 为「好看」改上游文档/翻译/CI。  
4. **补丁队列保持短**：seam / workspace / fork 工具 宜各成少数常青提交，避免把同一 seam 拆成十年历史。  
5. **rebase 后最低验证**：
   - `check-upstream-seams.sh`
   - `cd packages/opencode-vim && bun test`
   - `bash fork/build.sh`（至少 Vim smoke）  
6. **冲突处理原则**（与 rebase 模型一致）：
   - 普通上游文件 → 取上游；
   - seam → 重放最小逻辑，禁止扩大修改面；
   - lock → 上游 + `bun install`。

---

## 8. 明确不做什么

- 不为减少冲突而砍 Vim 功能面。  
- 不把更多业务逻辑塞回 `packages/tui` / `packages/opencode`。  
- 不以「整页复制上游」作为默认扩展方式。  
- 不把 build-time patch 当主维护模型（除非有强隔离发布需求且单独论证）。  
- 不在未验证的情况下 force-push 覆盖 `main`；干净队列需先备份再切换。

---

## 9. 建议的下一步（待决策）

文档审阅通过后，建议按序决策：

1. **是否将 `fork-clean-queue` 提升为新的 `main` 基线**（历史重写，需 `--force-with-lease`）。  
2. **是否启动 Phase 1**：盘点 `Tui.run` / Provider 树，产出 `runVimTui` 设计笔记并实施薄壳。  
3. **processor seam 的产品态度**：必须「deny 后继续」还是可接受「停一轮 + 提示」。

在未选择 2/3 之前，仅执行 Phase 0 已能明显改善日常同步体感。

---

## 10. 一句话策略

> **功能只写在 `opencode-vim`；启动路径不要再寄生在上游 `app.tsx`；权限那几行能删就删、不能删就忍或推上游。**  
> 冲突按「纪律 → 去壳依赖 → 去 processor」阶梯下降，而不是靠少写功能。
