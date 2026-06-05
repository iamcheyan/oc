# Fork AGENTS

Scope: `fork/**` and fork maintenance work that affects repo-level sync, packaging, release flow, or fork documentation.

## Update Flow

- `fork/update.sh` is the authoritative upstream sync script.
- Expected sequence:
  1. Stash local worktree changes when needed.
  2. Fetch `upstream/dev`.
  3. Merge upstream into the current local branch.
  4. Stop on unresolved conflicts and print concrete guidance.
  5. Remove upstream `.github/`.
  6. Refresh `README.md` from `fork/README.md`.
  7. Restore root `AGENTS.md` from `fork/AGENTS.root.md`.
  8. Refresh `packages/core/src/models-snapshot.js`.
  9. Build with `bash fork/build.sh`.
  10. Commit, push, then restore the stashed worktree.

## AGENTS Ownership

- Root `AGENTS.md` is fork-owned, even if upstream ships its own version.
- The canonical source for the root file is `fork/AGENTS.root.md`.
- Do not hand-edit root `AGENTS.md` without also updating `fork/AGENTS.root.md`.

## Snapshot Policy

- `packages/core/src/models-snapshot.js` is a tracked runtime fallback asset.
- Do not regenerate it in `fork/build.sh`.
- Refresh it during upstream sync or explicit release prep.

## Build And Validation

- Validate shell scripts with `bash -n fork/build.sh` or `bash -n fork/update.sh` after edits.
- Validate the fork package with:
  - `bash fork/check-upstream-seams.sh`
  - `cd packages/opencode-vim && bun test`
  - `bash fork/build.sh`
- The build emits:
  - `opencode-vim`

## Upstream Seam Policy

Upstream declined official TUI extension hooks. Fork keeps a **fixed allowlist** of upstream files:

- `fork/upstream-seams.allowlist`
- `bash fork/check-upstream-seams.sh` (also in build, update, pre-commit, CI)

Do not add fork behavior under `packages/opencode/src/**` outside the allowlist.

| File | Purpose |
|------|---------|
| `packages/opencode/src/cli/cmd/tui/app.tsx` | `OPENCODE_TUI_ROOT_COMPONENTS`, `OPENCODE_MINIMAL_*` env, update-check skip |
| `packages/opencode/src/session/processor.ts` | permission reject clears `ctx.blocked` |

Session context is **fork-owned**: `packages/opencode-vim/src/context/session-context.ts`. Do not re-export `context` from `session/index.tsx`.

`packages/opencode-vim/src/upstream/**` is the adapter boundary for upstream TUI internals. Do not import `@tui/routes/session` from Vim UI components.

See `fork/docs/202606052006_upstream-conflict-risk-map.md`.

## Docs

- Store fork planning and maintenance docs under `fork/docs/`.
- Use timestamped filenames like `YYYYMMDDHHMM_topic.md`.
- Keep docs focused on fork-specific decisions, not generic upstream behavior.
