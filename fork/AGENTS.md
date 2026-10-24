# Fork Maintenance

Scope: fork-specific code, documentation, build logic, and upstream sync work.

## Git Model

- **Our Default Branch**: `main` (`origin/main`).
- **Upstream Base**: `upstream/dev` (`https://github.com/anomalyco/opencode.git dev`).
- `origin/main` is a linear fork patch queue rebased on top of `upstream/dev`.
- Routine updates run via `bash fork/update.sh`.
- Keep the worktree clean before syncing.
- Never replace rebase conflicts mechanically. Read the upstream change and adapt the fork behavior to the new API.
- Publish rewritten history with `git push origin main --force-with-lease`.

## Ownership

Fork-owned paths include:

- `fork/**`
- `packages/opencode-vim/**`
- `packages/miniapps/**`
- `packages/bedrock-scanner/**`
- `.oc/**`
- `.husky/**`
- `.gitignore`
- `.opencode/**`
- `README.md`
- `AGENTS.md`
- `.github/workflows/fork-build.yml`
- `.github/workflows/close-issues.yml`
- `.github/workflows/close-prs.yml`
- the fork workspace entries in `package.json` and `bun.lock`

Other upstream workflows, translated READMEs, and ordinary upstream packages remain upstream-owned.

## Upstream Seams

Only paths listed in `fork/upstream-seams.allowlist` may contain `FORK-SEAM (opencode-vim)` changes:

- `packages/tui/src/app.tsx`:
  1. Calls `installMinimalRootComponents()` (from `packages/opencode-vim/src/root-components.ts`) at module initialization so `globalThis.OPENCODE_TUI_ROOT_COMPONENTS` is populated with `{ Home: MinimalHome, Session: MinimalSession }` in standard CLI startups.
  2. Resolves `HomeComponent` / `SessionComponent` from `globalThis.OPENCODE_TUI_ROOT_COMPONENTS` and hides upstream top/bottom chrome (`SessionTabs`, `DevToolsBar`, `DialogHighlights`) when `hasCustomRootComponents()` is true.

Run `bash fork/check-upstream-seams.sh` after any rebase or seam edit. New seam files require an explicit architecture decision and an allowlist update.

## Module Graph & Import Rules (`packages/opencode-vim` <-> `packages/tui`)

- `packages/opencode-vim/src/**` **must use relative imports** (e.g. `../../tui/src/context/data`, `../../../tui/src/ui/dialog`) when importing from `packages/tui/src/**`, rather than `@/*` or `@tui/*` path aliases.
- **Why**: This allows `packages/cli`, `packages/tui`, and `packages/opencode-vim` to share a **single SolidJS module graph and context instances** during both `bun test` / `bun typecheck` and `packages/cli` binary compilation, without adding any fork-specific aliases to upstream `packages/cli/tsconfig.json` or `packages/tui/tsconfig.json`.

## Automatic Upstream Sync & Verification

```bash
# 1. Update from upstream/dev
bash fork/update.sh

# 2. Check seam boundaries
bash fork/check-upstream-seams.sh

# 3. Test opencode-vim
cd packages/opencode-vim && bun test && bun run typecheck && cd ../..

# 4. Check TUI types
cd packages/tui && bun run typecheck && cd ../..

# 5. Build binaries and plugin
bash fork/build.sh

# 6. Publish to origin/main
git push origin main --force-with-lease --no-verify
```

Store fork design and maintenance notes in `fork/docs/` with timestamped names following `fork/docs/AGENTS.md`.
