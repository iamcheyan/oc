# Root AGENTS (Fork Reference)

- This repository is an `opencode` fork with a standalone Vim TUI under `packages/opencode-vim/`.
- Keep root `AGENTS.md` aligned with upstream `upstream/dev` to avoid unnecessary root conflicts; keep fork-specific instructions in `fork/AGENTS.md`, `fork/AGENTS.root.md`, and `packages/opencode-vim/AGENTS.md`.
- The upstream default branch is `dev` (`upstream/dev`).

## Fork Boundaries

- Treat `packages/tui/src/**`, `packages/cli/src/**`, `packages/opencode/src/**`, and `packages/core/src/**` as protected upstream code by default.
- Only `packages/tui/src/app.tsx` (listed in `fork/upstream-seams.allowlist`) may contain `FORK-SEAM (opencode-vim)` edits.
- Put all Vim TUI behavior, routes, components, leader menu, and settings in `packages/opencode-vim/`.
- Prefer solutions that reduce future upstream merge conflicts.

## Where To Look

- For fork maintenance, upstream sync (`bash fork/update.sh`), build (`bash fork/build.sh`), seam verification (`bash fork/check-upstream-seams.sh`), and docs rules, read `fork/AGENTS.md` and `fork/docs/AGENTS.md`.
- For Vim TUI architecture, OpenCode 2 integration, relative import rules, and component guide, read `packages/opencode-vim/AGENTS.md` and `fork/docs/202610240935_opencode-v2-vim-migration-and-maintenance-guide.md`.

## Testing & Verification

- Run tests from package directories, not from repo root:
  - `bash fork/check-upstream-seams.sh`
  - `cd packages/opencode-vim && bun test && bun run typecheck`
  - `cd packages/tui && bun run typecheck`
  - `bash fork/build.sh`
