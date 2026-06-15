# opencode-vim

A Vim-oriented TUI maintained as a downstream fork of
[OpenCode](https://github.com/anomalyco/opencode).

This repository keeps the complete upstream project and adds a keyboard-first
frontend under `packages/opencode-vim/`. Most fork code lives in separate
packages; only two explicitly marked integration points modify upstream source.

![opencode-vim screenshot](fork/static/screenshot.jpeg)

## Fork Features

- Vim insert and normal modes
- LazyVim-inspired leader menu
- Compact prompt, status, token usage, and progress UI
- Fork-owned autocomplete and session presentation
- Standalone `opencode-vim` binary

## Relationship To Upstream

- `upstream/dev` is the canonical OpenCode development branch.
- `origin/main` is this fork's published branch.
- Fork commits form a small patch queue on top of `upstream/dev`.
- `fork/update.sh` rebases that queue whenever upstream advances.
- `fork/check-upstream-seams.sh` rejects accidental changes outside fork-owned
  paths and the two allowlisted upstream files.

Rebase here does not copy files over a fresh upstream checkout. Git first moves
the branch to the latest upstream commit, then reapplies each fork commit in
order. A conflict stops the process for manual review.

See
[`fork/docs/202606152140_rebase-maintenance-model.md`](fork/docs/202606152140_rebase-maintenance-model.md)
for the full maintenance model.

## Build

```bash
bash fork/build.sh
```

The local build is written under `fork/dist/`.

## Test

```bash
cd packages/opencode-vim
bun test
bun run typecheck
```

## Sync With Upstream

Start from a clean worktree:

```bash
bash fork/update.sh
```

The script fetches both remotes, creates a remote safety branch, rebases onto
`upstream/dev`, validates and builds the fork, then updates `origin/main` with
`--force-with-lease`.

## License

This downstream project follows the upstream OpenCode MIT license.
