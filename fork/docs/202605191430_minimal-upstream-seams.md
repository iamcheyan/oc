# opencode-vim Upstream Seams

This document records the current places where `opencode-vim` still depends on small upstream TUI changes.

Goal:

- Keep fork-specific UI behavior in `packages/opencode-vim/**` whenever possible.
- Minimize merge conflicts against upstream `packages/opencode/src/**`.
- Treat the upstream edits below as deliberate seams, not a license to keep adding fork logic broadly.

## Current fork-owned package

Primary package:

- `packages/opencode-vim/`

This package currently owns:

- minimal startup defaults
- minimal entrypoint
- fork-owned home/session root components
- minimal header

## Remaining upstream seams

These upstream files are still intentionally modified.

### 1. Root view injection

File:

- `packages/opencode/src/cli/cmd/tui/app.tsx`

Why it exists:

- `opencode-vim` needs a way to substitute fork-owned `Home` and `Session` views without forking the full upstream TUI bootstrap/provider stack.

Current role:

- Adds a very small global root-component override seam.

Why it should stay thin:

- This file changes upstream often.
- Any fork-specific UI policy beyond root view selection will increase merge pain.

### 2. Renderer mode bridge

File:

- `packages/opencode/src/cli/cmd/tui/app.tsx`

Why it exists:

- `opencode-vim` still relies on upstream TUI bootstrap/provider wiring.
- The fork needs a narrow way to alter renderer setup without changing default TUI behavior.

Current role:

- Reads `OPENCODE_MINIMAL_*` screen-mode/footer env only inside renderer config.

Why it should stay thin:

## Removed upstream seams

These seams existed earlier in the branch but were intentionally migrated away:

- `packages/opencode/src/cli/cmd/tui/context/minimal.ts`
- `packages/opencode/src/cli/cmd/tui/context/theme.tsx`

Current status:

- Minimal-mode theme default no longer modifies upstream theme selection.
- Minimal-mode env parsing is no longer centralized in a dedicated upstream helper file.
- The remaining env reads are local to the specific upstream seam files that still need them.

### 3. Session spacing and chrome branches

File:

- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

Why it exists:

- `opencode-vim` still reuses the upstream session rendering and dialog stack.
- To make that session look less like the default TUI, a number of spacing and chrome branches were added for minimal mode.

Current role:

- Adjusts:
  - sidebar defaults
  - animation defaults
  - scrollbar visibility
  - content padding/gaps
  - several message-level spacing/chrome decisions

Why it is the highest-risk seam:

- This file is large and upstream-active.
- It currently carries the most merge-conflict risk for minimal mode.

Migration target:

- Move more session presentation into package-owned components over time.
- Keep upstream session changes constrained to reusable hooks/seams, not visual policy.

### 4. Prompt appearance branch

File:

- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

Why it exists:

- `opencode-vim` wants a CLI-like prompt line but still needs upstream prompt behavior:
  - input editing
  - slash command handling
  - autocomplete
  - dialogs/pickers such as `/model`

Current role:

- Adds a minimal visual branch for prompt rendering.

Why it is still acceptable for now:

- Rewriting prompt behavior in the fork would reintroduce the same maintenance burden that made the standalone REPL path expensive.

Migration target:

- If upstream ever exposes a smaller prompt-shell seam, move the visual policy out of this file.

## Merge policy

During upstream syncs, treat these upstream files as special-case seam files:

- `packages/opencode/src/cli/cmd/tui/app.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

Resolution guidance:

- Prefer upstream by default.
- Re-apply only the minimal fork seam required for `opencode-vim`.
- Do not keep unrelated visual edits in upstream files if they can move into `packages/opencode-vim`.

## update.sh impact

`fork/update.sh` now explicitly treats `packages/opencode-vim/` as a fork-owned directory that must survive sync.

The script still cannot auto-resolve the upstream seam files listed above. Those should be reviewed manually when conflicts occur.

## Short-term recommendation

Accept that `opencode-vim` is currently:

- mostly package-owned
- but not yet fully upstream-isolated

The practical goal is not zero upstream edits at any cost. The practical goal is:

- keep the upstream touchpoints few
- keep them narrow
- document them clearly
- avoid spreading minimal-specific logic into more upstream files
