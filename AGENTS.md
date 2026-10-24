# AGENTS.md (OpenCode Vim Fork)

This repository is a downstream fork of [OpenCode](https://github.com/anomalyco/opencode) maintaining a keyboard-first, lightweight Vim TUI frontend in `packages/opencode-vim/`.

> [!IMPORTANT]
> **Instructions for Autonomous Maintenance Agents**  
> If you are an AI agent executing a scheduled or unattended sync task: read the [Automated Upstream Sync Protocol](#automated-upstream-sync-protocol) below and execute every step without human intervention.

---

## 1. Core Git & Branch Architecture

- **Active Published Branch**: `main` (`origin/main`). All development, local commits, daily syncs, and GitHub Releases occur on `main`.
- **Upstream Development Branch**: `upstream/dev` (`https://github.com/anomalyco/opencode.git dev`).
- **Relationship**: `main` is a clean linear patch queue rebased on top of `upstream/dev`.
  - Check our fork changes: `git diff upstream/dev...HEAD`
  - Push always requires: `git push origin main --force-with-lease --no-verify`

---

## 2. Fork Ownership & Boundaries

```
packages/
├── opencode-vim/       ← [FORK-OWNED] Full Vim TUI frontend, modes, leader menu, config
├── miniapps/          ← [FORK-OWNED] Auxiliary mini-tools (api-test, etc.)
├── bedrock-scanner/   ← [FORK-OWNED] AWS Bedrock model scanner
├── tui/               ← [UPSTREAM-OWNED] ONLY packages/tui/src/app.tsx is allowlisted
└── (all other packages) ← [UPSTREAM-OWNED] Protected upstream code (do not modify)
fork/                  ← [FORK-OWNED] Build, sync, seam check, and maintenance docs
.husky/                ← [FORK-OWNED] Git hooks and privacy scan
README.md, AGENTS.md   ← [FORK-OWNED] Customized fork documentation
```

**The Single-Seam Rule**:
Only `packages/tui/src/app.tsx` (`fork/upstream-seams.allowlist`) may touch upstream code. Any other upstream modification will fail `bash fork/check-upstream-seams.sh`.

---

## 3. Automated Upstream Sync Protocol (For Scheduled AI Tasks)

When triggered by a cron job or scheduled task, follow this exact deterministic sequence:

### Step 1: Environment & Worktree Sanity
```bash
export PATH="$HOME/.bun/bin:$PATH"
export GIT_EDITOR=true

# Check worktree
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  git stash -u -m "auto-sync-stash-$(date +%Y%m%d%H%M%S)"
fi
```

### Step 2: Execute Rebase via Sync Script
```bash
bash fork/update.sh
```
`fork/update.sh` automatically:
1. Runs `git fetch upstream`.
2. Creates an automatic timestamped backup branch `backup/main-before-upstream-*` (and cleans backups older than the latest 5).
3. Executes `git rebase upstream/dev`.
4. If `bun.lock` conflicts: automatically takes upstream (`git checkout --theirs bun.lock`) and runs `bun install` to rebuild dependencies cleanly.

### Step 3: Resolving Conflicts Deterministically

If `git rebase` pauses for conflicts, inspect `git status`. The only possible conflict files are:

#### Case A: `bun.lock`
```bash
git checkout --theirs bun.lock
git add bun.lock
GIT_EDITOR=true git rebase --continue
```

#### Case B: `bun install` fails with `minimum-release-age`
If `bun install` reports a package blocked by `minimum-release-age`:
1. Temporarily add the blocked package name to `minimumReleaseAgeExcludes` in `bunfig.toml`.
2. Re-run `bun install`.
3. Restore `bunfig.toml`: `git checkout bunfig.toml`.

#### Case C: `packages/tui/src/app.tsx` (Allowlisted Seam)
Accept the new upstream `app.tsx` as the base, and ensure the four `FORK-SEAM (opencode-vim)` blocks remain in place:

1. **Header Import**:
   ```ts
   // FORK-SEAM (opencode-vim): install minimal vim root components.
   import { installMinimalRootComponents } from "../../opencode-vim/src/root-components"
   ```
2. **Module Init in `run`**:
   ```ts
   // FORK-SEAM (opencode-vim): install minimal vim root components by default unless disabled.
   if (process.env.OPENCODE_VIM !== "0" && !process.env.OPENCODE_STORY && !process.env.OPENCODE_DRIVE) {
     installMinimalRootComponents()
   }
   ```
3. **Tab Suppression**:
   ```ts
   // FORK-SEAM (opencode-vim): suppress upstream session tabs when minimal root components are registered.
   const tabsAvailable = () =>
     !(globalThis as any).OPENCODE_TUI_ROOT_COMPONENTS &&
     sessionTabs.enabled() &&
     sessionTabs.tabs().length > 0 &&
     route.data.type !== "plugin"
   ```
4. **Route Component Resolution**:
   ```tsx
   <Match when={route.data.type === "home"}>
     {(() => {
       // FORK-SEAM (opencode-vim): resolve the fork-specific home root when registered.
       const View = (globalThis as any).OPENCODE_TUI_ROOT_COMPONENTS?.Home ?? Home
       return <View />
     })()}
   </Match>
   <Match when={route.data.type === "session"}>
     <Show when={route.data.type === "session" ? route.data.sessionID : undefined} keyed>
       {(sessionID) => {
         // FORK-SEAM (opencode-vim): resolve the fork-specific session root when registered.
         const View = (globalThis as any).OPENCODE_TUI_ROOT_COMPONENTS?.Session ?? SessionFrame
         return <View sessionID={sessionID} verticalTabsWidth={verticalTabsVisible() ? tabsResize.size() : 0} />
       }}
     </Show>
   </Match>
   ```
Then mark resolved:
```bash
git add packages/tui/src/app.tsx
GIT_EDITOR=true git rebase --continue
```

#### Case D: Persistent Failure
If a conflict cannot be resolved after 3 attempts:
```bash
git rebase --abort
```
Output an explicit error report stating which file and upstream commit blocked the rebase. **Never falsely report success.**

---

### Step 4: Mandatory Post-Sync Verification Checklist

Run these four commands in exact order. All must exit 0:
```bash
# 1. Seam boundary audit
bash fork/check-upstream-seams.sh

# 2. opencode-vim unit tests and typecheck (catches upstream context/API drift)
cd packages/opencode-vim && bun test && bun run typecheck && cd ../..

# 3. TUI typecheck
cd packages/tui && bun run typecheck && cd ../..

# 4. Build plugin bundle and standalone binary, verify smoke tests
bash fork/build.sh
```

---

### Step 5: Commit & Publish

```bash
# Push directly to main
git push origin main --force-with-lease --no-verify
```
GitHub Actions (`.github/workflows/fork-build.yml`) will automatically compile Linux x64 and macOS arm64 binaries and publish the release.

---

### Step 6: Standard Task Output Format
- **On Success**: Output a concise single-line summary:
  `oc 同步成功：<N> 个上游 commits 已并入 main，Release 自动构建中`
- **On Failure**: Detail the exact error:
  `oc 同步失败：卡在步骤 <步骤名>，冲突文件: <文件列表>，rebase 已安全回滚`

---

## 4. Code & Architecture Rules for Fork Features

1. **Relative Imports**:
   - In `packages/opencode-vim/src/**`, importing from `packages/tui` MUST use relative paths (e.g. `../../tui/src/context/data`), never `@/*` or `@tui/*`.
   - This ensures a single SolidJS context graph without altering upstream `tsconfig.json`.
2. **OpenCode 2 APIs**:
   - Keybindings: `Keymap.createLayer({ id, mode, bindings })`.
   - Palette commands: always provide `id:`.
   - Custom dialogs: wrap in `DialogIntegration`.
   - Autocomplete: compute bounding box relative to `container.parent`.
