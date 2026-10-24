# opencode-vim AGENTS

Scope: `packages/opencode-vim/**`.

## Ownership & Purpose

- This package is the fork-specific minimal Vim TUI frontend for OpenCode 2.
- All minimal-mode routes (`MinimalHome`, `MinimalSession`), Vim normal/insert state, Leader menu (`<Space>`), bottom status bar, compact prompt, and `/` / `@` autocomplete live here.
- Keep upstream `packages/tui` untouched except for the single allowlisted seam in `packages/tui/src/app.tsx`.

## Architecture & Entrypoints

1. **Direct Root Component Registration (`src/root-components.ts`)**:
   - `installMinimalRootComponents()` sets `globalThis.OPENCODE_TUI_ROOT_COMPONENTS = { Home: MinimalHome, Session: MinimalSession }`.
   - Called at module load by `packages/tui/src/app.tsx` (`FORK-SEAM (opencode-vim)`) so that every CLI/TUI launch boots directly into the minimal Vim UI.
2. **TUI Plugin Bundle (`src/plugin.tsx` & `script/build.ts`)**:
   - Exports the external TUI plugin entry (`fork/dist/plugin/tui.js`) and calls `installMinimalRootComponents()` on install.
3. **Key Files Map**:
   - `src/routes/home.tsx`: `MinimalHome` route, auto-resume, Leader commands, Vim settings toggles.
   - `src/routes/session.tsx`: `MinimalSession` route, compact message stream, tool visibility (`hideTools`), `pureMode`, permission auto-allow, Normal-mode navigation (`j`/`k`/`gg`/`G`/`/commands`).
   - `src/component/prompt.tsx`: Minimal prompt input, Normal/Insert mode transitions (`i`, `a`, `<Esc>`), Leader trigger (`<Space>`), quick model slots, stash/history integration.
   - `src/component/autocomplete.tsx`: `/` slash command and `@` file/agent autocomplete popup (uses OpenCode 2 `Keymap.createLayer({ mode: "autocomplete" })` and calculates coordinates relative to `container.parent`).
   - `src/component/minimal-layout.tsx`: Bottom status bar (`INSERT` / `NORMAL`, agent badge, model & token info, `LEADER MENU` popup).
   - `src/component/dialog-model.tsx` & `src/component/dialog-vim-settings.tsx`: Model picker and Vim settings dialog (using OpenCode 2 `DialogIntegration` and `Keymap.createLayer`).
   - `src/config/vim.ts`: Persistent `~/.config/opencode/vim.json` reactive config (`loadVimConfig`, `saveVimConfig`).

## Critical Rules for OpenCode 2 Compatibility

1. **Use Relative Imports to `packages/tui/src/**`**:
   - Never use `@/*` or `@tui/*` imports in `packages/opencode-vim/src/**`.
   - Always use relative paths (e.g. `../../tui/src/context/data`, `../../../tui/src/ui/dialog`) so `packages/cli`, `packages/tui`, and `packages/opencode-vim` share the exact same module instances and SolidJS contexts without modifying upstream `tsconfig.json` files.
2. **Use OpenCode 2 Keymap & Dialog APIs**:
   - Register modal keybindings with `Keymap.createLayer({ id, description, mode, bindings })` instead of V1's removed `useBindings`.
   - Register command palette entries with `id:` (not V1's `name:`).
   - Wrap custom dialogs with `DialogIntegration` (not V1's `DialogProvider`).
3. **Do Not Wrap Minimal Footers in Upstream `<Slot>`**:
   - In `src/component/minimal-layout.tsx`, render minimal status bars directly instead of wrapping them in upstream `<Slot name="home_prompt" mode="replace">`, otherwise upstream `tui:core` plugins will overwrite the minimal Vim status bar.

## Validation

```bash
cd packages/opencode-vim
bun test
bun run typecheck
```
