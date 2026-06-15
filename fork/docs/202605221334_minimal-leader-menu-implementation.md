# Minimal Leader Menu Implementation

## Goal

Make the fork-owned Vim TUI show a LazyVim-like leader popup in the lower-right corner, with real two-step key navigation and mostly real command targets.

## Render Path

- Entry point: `packages/opencode-vim/src/routes/session.tsx`
- Keybinding and menu ownership: `packages/opencode-vim/src/feature/vim-mode.tsx`
- Render site: `<LeaderMenu />` is mounted near the end of `MinimalSession`, alongside `<Toast />`

## Visibility Model

The menu is no longer always visible.

It now renders only while the custom minimal leader state is active:

1. Enter normal mode
2. Press `space`
3. The lower-right popup opens
4. Press a group key such as `g` or `m`
5. The popup switches to that subgroup
6. Press a leaf key to execute a command

Close behavior:

- `escape`: close popup
- `backspace`: go back from subgroup to root

## Overlay Structure

`LeaderKeyMenu` uses:

1. `Portal`
2. Full-screen `box` with:
   - `position="absolute"`
   - `left={0}`
   - `top={0}`
   - `width={dimensions().width}`
   - `height={dimensions().height}`
   - `zIndex={3500}`
   - `alignItems="flex-end"`
   - `justifyContent="flex-end"`
3. Inner menu `box` with:
   - right and bottom margins
   - visible border
   - panel background
   - header, rows, and footer

This behaves like a fixed overlay layer rather than an in-flow widget.

## Menu Model

The current root groups are:

- `a` → `+agent`
- `g` → `+git`
- `m` → `+model`
- `s` → `+session`
- `u` → `+ui`

Current leaf actions:

- `g d` → custom git diff viewer
- `g g` → custom lazygit launcher
- `a a` → `agent.list`
- `a n` → `agent.cycle`
- `a p` → `agent.cycle.reverse`
- `m m` → `model.list`
- `m v` → `variant.list`
- `s n` → `session.new`
- `s l` → `session.list`
- `s w` → `workspace.set`
- `u p` → `command.palette.show`
- `u s` → `opencode.status`
- `u t` → `theme.switch`

## Command Dispatch

Most leaf items do not reimplement behavior locally.

Instead they call the existing OpenCode keymap command registry through:

- `keymap.dispatchCommand(commandName)`

That keeps the fork menu thin and reduces merge conflict risk.

The custom special cases in this menu are:

- `lazygit`

That action still suspends the renderer and launches the external process directly.

## Styling Direction

The popup is intentionally closer to LazyVim than to upstream which-key:

- narrow right-side panel
- bordered dark surface
- bright leader keys on the left
- arrow separator
- colored group labels with `+group` naming
- footer hints for close and back navigation

## Why This Shape

The fork needs a leader popup that feels native to the minimal vim flow, but should still reuse upstream commands wherever possible.

So the implementation is split into two layers:

1. fork-owned menu state and rendering
2. upstream command execution through dispatch

## Next Extension Points

If more LazyVim parity is needed, extend `LEADER_MENU` in `packages/opencode-vim/src/feature/vim-mode.tsx`:

- add more root groups
- add more leaf actions
- map leaves to existing command names first
- only add custom imperative handlers when no command exists upstream
