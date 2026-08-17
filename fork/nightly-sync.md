# 每晚 oc fork 上游同步任务

你在 /home/tetsuya/development/oc 仓库执行上游同步（fork of anomalyco/opencode，main 分支变基 upstream/dev）。按步骤执行，全程无人值守：

1. `cd /home/tetsuya/development/oc && export PATH="$HOME/.bun/bin:$PATH"`
2. 工作区必须干净：`git status --porcelain` 有输出就 `git stash` 记录后继续（完成后恢复）。
3. `bash fork/update.sh`（内部：fetch upstream → rebase upstream/dev → bun.lock 冲突自动取上游 → bun install 重建）
   - 若 rebase 中途卡在无 TTY 的编辑器（`git rebase --continue` 挂起）：`kill` 挂起进程后用 `GIT_EDITOR=true git rebase --continue` 推进。
   - 若 bun install 报 `minimum-release-age` 阻断：把报错里被拦的包名临时加进 bunfig.toml 的 `minimumReleaseAgeExcludes`，装完**还原 bunfig.toml**（`git checkout bunfig.toml`）。
   - 若出现真代码冲突：按 fork/AGENTS.md 规则解——`packages/tui/src/app.tsx` 是唯一允许的 seam 文件（保留 FORK-SEAM 标记块）；其余 fork 自有路径（packages/opencode-vim 等）以 fork 侧为准；上游文件以上游为准。解完 `git add` + `GIT_EDITOR=true git rebase --continue`。
   - 彻底解不开（连续 3 次失败）：`git rebase --abort`，跳到第 6 步报告失败。
4. 验证（fork/AGENTS.md 清单）：
   - `bash fork/check-upstream-seams.sh`（exit 0；若报 allowlist 文件缺 seam 标记，说明上游吸收了 seam，从 fork/upstream-seams.allowlist 删该行再跑）
   - `cd packages/opencode-vim && bun test && bun run typecheck`（测试全过、类型零错）
5. 通过后提交推送：
   - 有变更：`git add -A && git commit -m "chore(fork): nightly upstream sync $(date +%Y-%m-%d)"`
   - `git push origin main --force-with-lease --no-verify`（--no-verify 绕过全仓 typecheck 钩子：4 核 VM 上超时，fork 范围检查已在第 4 步做过）
   - push 后 GitHub Actions 的 Fork Build workflow 自动编译并发布 Release，无需干预。
6. 报告（最终输出）：成功 → 一行「oc 同步成功：N 个上游 commits 已并入，Release 自动构建中」；失败 → 具体卡在哪步、rebase 是否已 abort、有无需要人工介入的冲突文件。禁止谎报成功。
