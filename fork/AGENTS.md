# Fork Maintenance

Scope: fork-specific code, documentation, build logic, and upstream sync work.

## Git Model

- `upstream/dev` is the base (see root AGENTS.md: default branch is `dev`).
- `origin/main` is a linear fork patch queue on top of that base.
- Use `bash fork/update.sh` for routine upstream updates.
- Keep the worktree clean before syncing; the script does not hide work in a stash.
- Never replace rebase conflicts mechanically. Read the upstream change and
  adapt the fork behavior to the new API.
- Publish rewritten history only with `--force-with-lease`.

## Ownership

Fork-owned paths include:

- `fork/**`
- `packages/opencode-vim/**`
- `packages/miniapps/**`
- `packages/bedrock-scanner/**`
- `.oc/**`
- `.gitignore`
- `.opencode/**`
- `README.md`
- `.github/workflows/fork-build.yml`
- the fork workspace entries in `package.json` and `bun.lock`

Root `AGENTS.md`, upstream workflows, translated READMEs, and ordinary upstream
packages remain upstream-owned.

## Upstream Seams

Only paths listed in `fork/upstream-seams.allowlist` may contain
`FORK-SEAM (opencode-vim)` changes:

- `packages/tui/src/app.tsx`: root component injection, minimal renderer mode,
  and embedded update lifecycle.
- `packages/opencode/src/session/processor.ts`: permission rejection behavior
  for the Vim workflow.

Run `bash fork/check-upstream-seams.sh` after any rebase or seam edit. New seam
files require an explicit architecture decision and an allowlist update.

## Validation

```bash
bash -n fork/update.sh fork/build.sh fork/check-upstream-seams.sh
bash fork/check-upstream-seams.sh
cd packages/opencode-vim
bun test
bun run typecheck
cd ../..
bash fork/build.sh
```

Store fork design and maintenance notes in `fork/docs/` with timestamped names.
