# Leader Menu Bug Fix Plan

## Goal
Fix the bug where the Leader Menu responds to key events (like `enter`, `up`, `down`) even when it's not visibly displayed. The user explicitly requested that the menu and its events should only be loaded when the menu is actually displayed.

## Approach
Currently, all leader menu key bindings (`enter`, `up`, `down`, `a-z` shortcuts) are registered globally in `useVimHome` and `useVimSession`. We will extract these specific bindings into a new SolidJS component (`VimLeaderKeybindings`) which is ONLY mounted when `isLeaderActive()` is true.

### Steps
1. **Create `VimLeaderKeybindings` component in `vim-mode.tsx`:**
   - Move the `up`, `down`, `enter`, `escape` (for closing menu), `backspace`, and letter shortcuts from `useVimHome` and `useVimSession` into this component.
   - The component will use `@tui/keymap`'s `useBindings` to register these keys.
   - It will take `menu` and the `handle...` functions as props.

2. **Remove bindings from `useVimHome` and `useVimSession`:**
   - Keep ONLY the `"space"` and `" "` bindings (to open the menu).
   - Keep `"/"`, `":"`, `"return"` (to focus prompt).

3. **Render `VimLeaderKeybindings` when active:**
   - In `session.tsx` and `home.tsx` (or directly inside `prompt.tsx` if possible), wrap `<VimLeaderKeybindings>` in `<Show when={vimMode.isLeaderActive()}>`.
   - Actually, since `useVimHome` and `useVimSession` already have access to the `menu` and `handle` functions, they can just return the component as a renderable closure or JSX element!
   - Example: `return { LeaderBindings: () => <Show when={isLeaderActive()}><VimLeaderKeybindings ... /></Show> }`
   - Then in `home.tsx` and `session.tsx`, we just render `<vim.LeaderBindings />`.

This absolutely guarantees that the key bindings DO NOT EXIST when the menu is not displayed, satisfying the user's logic exactly.
