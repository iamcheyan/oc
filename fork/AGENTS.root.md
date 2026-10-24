# AGENTS.md (OpenCode Vim Fork)

This repository is a downstream fork of [OpenCode](https://github.com/anomalyco/opencode) (`upstream/dev`) that maintains a lightweight, keyboard-first Vim TUI frontend in `packages/opencode-vim/`.

## Core Git & Branch Model

- **Our Default Branch**: `main` (`origin/main`). All ongoing work, local commits, and releases happen on `main`.
- **Upstream Development Branch**: `upstream/dev` (`https://github.com/anomalyco/opencode.git dev`).
- **Relationship**: `main` sits as a clean, minimal linear patch queue directly rebased on top of `upstream/dev`.
- Diff against `upstream/dev` to see our fork-specific changes: `git diff upstream/dev...HEAD`.
- Always push to `origin main` using `--force-with-lease` after rebasing.

## Automated Upstream Sync & Merge Strategy

Upstream updates frequently (multiple times a day). Whenever you need to sync with upstream or after upstream commits new features:

### 1. Run Automated Sync Script
Start with a clean worktree and run:
```bash
bash fork/update.sh
```

### 2. What Happens Automatically
1. Fetches latest commits from `upstream/dev` (`git fetch upstream`).
2. Creates an automatic timestamped backup branch `backup/main-before-upstream-*` and purges backups older than the latest 5.
3. Rebases `main` onto `upstream/dev` (`git rebase upstream/dev`).
4. **Lockfile Conflict Auto-Resolution**: When `bun.lock` conflicts, the script automatically takes upstream's version and runs `bun install` to rebuild the lockfile cleanly from resolved dependencies.

### 3. Handling Upstream Seam Conflicts (Preserving Vim Modifications)
99% of our fork code lives in isolated directories (`packages/opencode-vim/**`, `packages/miniapps/**`, `packages/bedrock-scanner/**`, and `fork/**`), which never conflict with upstream.

The **ONLY allowlisted file that touches upstream code** is:
- `packages/tui/src/app.tsx` (`fork/upstream-seams.allowlist`)

If `packages/tui/src/app.tsx` has a merge conflict during rebase:
1. Accept the upstream changes as the baseline structure.
2. Ensure the two `// FORK-SEAM (opencode-vim):` blocks remain intact:
   - **Header**: Call `installMinimalRootComponents()` from `packages/opencode-vim/src/root-components.ts` at module init so `globalThis.OPENCODE_TUI_ROOT_COMPONENTS` is defined.
   - **Body**: In the route rendering tree, render `<Dynamic component={HomeComponent()} />` and `<Dynamic component={SessionComponent()} />`, and hide upstream chrome (`SessionTabs`, `DevToolsBar`, `DialogHighlights`) when `hasCustomRootComponents()` is true.
3. Mark resolved and continue:
   ```bash
   git add packages/tui/src/app.tsx
   GIT_EDITOR=true git rebase --continue
   ```

### 4. Mandatory Post-Sync Verification Checklist
Every sync or merge must pass these four checks in order:
```bash
# 1. Verify no accidental diffs exist outside fork-owned paths and allowlisted seams
bash fork/check-upstream-seams.sh

# 2. Run Vim package unit tests and typecheck (catches upstream API changes instantly)
cd packages/opencode-vim && bun test && bun run typecheck && cd ../..

# 3. Verify TUI package typecheck
cd packages/tui && bun run typecheck && cd ../..

# 4. Build binary and plugin bundle, verify smoke test
bash fork/build.sh
```

### 5. Pushing Upstream Syncs
```bash
git push origin main --force-with-lease --no-verify
```
GitHub Actions (`.github/workflows/fork-build.yml`) will automatically build Linux x64 and macOS arm64 binaries and publish the updated release.

---

## Fork Ownership Boundaries

Fork-owned paths:
- `fork/**`
- `packages/opencode-vim/**`
- `packages/miniapps/**`
- `packages/bedrock-scanner/**`
- `.oc/**`
- `.husky/**`
- `README.md`
- `AGENTS.md`
- `.github/workflows/fork-build.yml`
- `.github/workflows/close-issues.yml`
- `.github/workflows/close-prs.yml`
- Workspace entries in `package.json` and `bun.lock`

All other paths are upstream-owned. Do not add modifications to upstream packages unless explicitly registered in `fork/upstream-seams.allowlist`.

## Packages / Code Guidelines

- **Relative Imports**: All code in `packages/opencode-vim/src/**` importing from `packages/tui` MUST use relative paths (e.g. `../../tui/src/context/data`), never `@/*` or `@tui/*`. This preserves a single SolidJS context graph without altering upstream `tsconfig.json`.
- **OpenCode 2 APIs**: Use `Keymap.createLayer({ mode, bindings })` for keybindings, palette commands must have `id:`, and custom dialogs must use `DialogIntegration`.
- **Commits & PRs**: Use conventional commits (`feat(vim): ...`, `fix(vim): ...`, `chore(fork): ...`).
- **Tests**: Run tests from package directories (`cd packages/opencode-vim && bun test`).
- **Documentation**: Record major architectural decisions, bugfixes, and sync records in `fork/docs/` with timestamped filenames (`YYYYMMDDHHMM_name.md`) following `fork/docs/AGENTS.md`.
