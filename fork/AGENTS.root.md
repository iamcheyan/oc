# Root AGENTS

- This repository is an `opencode` fork with a standalone Vim TUI under `packages/opencode-vim/`.
- This root file is fork-owned and should be restored after upstream merges. The canonical source is `fork/AGENTS.root.md`.
- The default branch is `dev`. Local `main` may not exist; use `dev` or `origin/dev` for diffs.
- Always use parallel tools when applicable.
- Prefer automation: execute requested actions unless blocked by missing info or safety.

## Fork Boundaries

- Treat `packages/opencode/src/**` as protected upstream code by default.
- Do not put fork-specific behavior into upstream entrypoints or core modules when `packages/opencode-vim/` can own the change.
- Register fork Vim TUI commands in `packages/opencode-vim/src/index.ts` unless the task explicitly requires another integration point.
- Prefer solutions that reduce future upstream merge conflicts.

## Where To Look

- For fork maintenance, sync, build, release, and docs rules, read `fork/AGENTS.md`.
- For standalone Vim TUI implementation rules, tests, and runtime-state rules, read `packages/opencode-vim/AGENTS.md`.

## Testing

- Run tests from package directories, not from repo root.
- For fork Vim TUI work, use `cd packages/opencode-vim && bun test`.
- For fork binary verification, use `bash fork/build.sh`.

## Type Checking

- Run type checks from package directories with `bun typecheck`.
