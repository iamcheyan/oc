# 每晚 oc fork 上游自动同步任务指令

你在 `/home/tetsuya/development/oc` 仓库执行无人值守的上游自动化同步任务（Fork of `anomalyco/opencode`，`main` 分支变基 `upstream/dev`）。

请直接严格遵循根目录 [`AGENTS.md`](../AGENTS.md) 中的「**Automated Upstream Sync Protocol**」执行：

1. **环境准备与工作区检查**：
   - `export PATH="$HOME/.bun/bin:$PATH"`
   - `export GIT_EDITOR=true`
   - 检查工作区（如有未提交修改先 `git stash -u`）。
2. **运行同步脚本**：
   - `bash fork/update.sh`
   - `bun.lock` 冲突自动取上游并 `bun install` 重建。
   - `bun install` 若报 `minimum-release-age`，临时在 `bunfig.toml` 的 `minimumReleaseAgeExcludes` 豁免后重装并还原 `bunfig.toml`。
3. **接缝冲突处理（保住 Vim 核心）**：
   - 严格按照 [`AGENTS.md`](../AGENTS.md) 中给出的 4 处 `FORK-SEAM (opencode-vim)` 代码块维护 [`packages/tui/src/app.tsx`](../packages/tui/src/app.tsx)。
   - 其它 fork 专属目录（`packages/opencode-vim/**` 等）以 fork 侧为准；上游目录以上游为准。
   - 3 次尝试无法解开则 `git rebase --abort` 并报告失败。
4. **四步必检验证**：
   - `bash fork/check-upstream-seams.sh`
   - `cd packages/opencode-vim && bun test && bun run typecheck && cd ../..`
   - `cd packages/tui && bun run typecheck && cd ../..`
   - `bash fork/build.sh`
5. **提交并推送**：
   - `git push origin main --force-with-lease --no-verify`
   - 远程 GitHub Actions 自动编译 Linux x64 与 macOS arm64 二进制并发布 Release。
6. **最终输出格式**：
   - 成功：`oc 同步成功：<N> 个上游 commits 已并入 main，Release 自动构建中`
   - 失败：`oc 同步失败：卡在步骤 <步骤名>，冲突文件: <文件列表>，rebase 已安全回滚`（禁止谎报成功）
