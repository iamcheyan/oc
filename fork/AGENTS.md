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
  - `cd packages/opencode-vim && bun test`
  - `bash fork/build.sh`
- The build emits:
  - `opencode-vim`

## Upstream Export Dependencies

Our fork packages import a small number of symbols from upstream protected files. These exports may be removed by upstream during refactoring (e.g. `export` → module-internal). After each sync, verify they still exist.

| Symbol | Upstream file | Fork consumer |
|--------|--------------|---------------|
| `context` | `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` | `packages/opencode-vim/src/upstream/session.ts` |

`packages/opencode-vim/src/upstream/**` is the adapter boundary for upstream TUI internals. Do not import route internals such as `@tui/routes/session` directly from Vim UI components; add or update an adapter export instead. Keep fork-owned copies of keybinding command lists and small helper wrappers in the adapter when possible, instead of exporting more symbols from upstream route files.

If any are missing after a merge, add `export` back to the upstream file. See `fork/docs/202605212058_upstream-sync-conflict-record.md` for full history.

## Docs

- Store fork planning and maintenance docs under `fork/docs/`.
- Use timestamped filenames like `YYYYMMDDHHMM_topic.md`.
- Keep docs focused on fork-specific decisions, not generic upstream behavior.
