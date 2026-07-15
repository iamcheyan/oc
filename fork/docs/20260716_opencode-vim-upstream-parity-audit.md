# opencode-vim upstream parity audit

Date: 2026-07-16

## Context

`packages/opencode-vim` has recently replaced large parts of the upstream TUI session screen with a minimal/Vim-oriented session UI. That refactor is intentional, but several upstream behaviors were only partially carried over.

The main risk pattern is:

1. upstream command ids, menu entries, or state names still exist;
2. the opencode-vim route no longer registers the corresponding handlers or UI;
3. users can see an entry or rely on an old behavior, but the actual behavior is missing.

This document is the working checklist for restoring important behavior without undoing the minimal UI direction.

## Priority 1: dead session commands

### Finding

`packages/opencode-vim/src/upstream/session.ts` still exposes many upstream session command ids, but `packages/opencode-vim/src/routes/session.tsx` only registers a small subset.

Known missing or suspicious command handlers:

- `session.share`
- `session.unshare`
- `session.rename`
- `session.timeline`
- `session.fork`
- `session.compact`
- `session.undo`
- `session.redo`
- `session.toggle.conceal`
- `session.toggle.timestamps`
- `session.toggle.actions`
- `session.toggle.scrollbar`
- `session.toggle.generic_tool_output`
- `session.first`
- `session.last`
- `session.messages_last_user`
- `session.message.next`
- `session.message.previous`
- `messages.copy`
- `session.copy`
- `session.export`

`packages/opencode-vim/src/feature/leader-menu.ts` already exposes some of these entries, especially `fork`, `share`, `rename`, `timeline`, and `compact`. These are the most user-visible failures because the menu can present actions that do not execute.

### Desired fix

Restore handlers for leader-visible commands first:

1. `session.fork`
2. `session.share`
3. `session.rename`
4. `session.timeline`
5. `session.compact`
6. `session.undo`
7. `session.redo`

For commands that are intentionally not supported by opencode-vim, remove them from visible menus and avoid advertising their keybindings.

### Acceptance check

- Every visible leader menu session action dispatches to a registered command.
- The command palette/keybinding list does not include opencode-vim actions that are intentionally unsupported.
- No command silently does nothing.

## Priority 2: compact user message parity

### Finding

`CompactUserMessage` currently renders only non-synthetic text content. Upstream `UserMessage` also supports:

- file parts and directory chips;
- queued/pending prompt marker;
- timestamp display;
- compaction separator;
- hover/click behavior for opening message details.

The current opencode-vim render loop also does not pass enough data to restore these interactions.

### Desired fix

Keep the compact visual style, but restore the useful metadata:

1. render file and directory parts as compact chips;
2. show queued/pending state when applicable;
3. restore compaction separator behavior;
4. restore click or equivalent keyboard-accessible path to `DialogMessage`;
5. wire timestamp display to the same toggle state used by the session context.

### Acceptance check

- A user prompt containing file references still shows those files.
- Queued prompts are visibly different from admitted prompts.
- Compaction messages are distinguishable from normal user prompts.
- Message detail dialog remains reachable.

## Priority 3: assistant task hints

### Finding

The task/subagent tool display is back, and `session.background` has been restored. However, upstream assistant messages show a small task hint with shortcuts for:

- viewing subagents;
- moving the task to background.

The compact assistant renderer does not currently show this hint.

### Desired fix

Restore a minimal hint near task tool parts. It should use the existing command shortcut lookup rather than hardcoded text.

### Acceptance check

- When an assistant message contains a `task` tool part, users can discover the subagent and background actions from the UI.
- The hint respects the actual configured shortcuts.

## Priority 4: retry action dialog

### Finding

The top status bar now shows retry/quota status again, but upstream also listens for `session.status` retry events with an `action`. When present, upstream opens `DialogRetryAction`.

Without this, account/provider limit cases may show a warning but not the action users need to take.

### Desired fix

Port the upstream retry action listener into opencode-vim:

1. listen for `session.status`;
2. when status is `retry` and contains `action`, show `DialogRetryAction`;
3. preserve upstream suppression behavior for recently dismissed or "do not show again" retry dialogs if that behavior still exists in current upstream.

### Acceptance check

- Retry text still appears in the top status bar.
- Retry events with actions open the appropriate dialog.
- Dismissed retry action dialogs do not repeatedly reopen in a tight loop.

## Priority 5: undo/redo and revert UI

### Finding

Upstream session UI supports revert/redo state:

- reverted messages can be hidden;
- a "messages reverted" panel is shown;
- file diff summaries are shown;
- redo can restore the reverted state.

The opencode-vim render loop currently renders all messages and does not show the revert panel.

### Desired fix

Restore the undo/redo behavior in the minimal UI:

1. implement `session.undo`;
2. implement `session.redo`;
3. hide or visually mark reverted messages consistently with upstream;
4. show a compact revert panel with redo action and file diff summary.

### Acceptance check

- Undo hides or marks reverted messages consistently.
- Redo restores the reverted messages.
- The user can see what was reverted.

## Priority 6: display toggles and persisted view state

### Finding

The opencode-vim session context currently hardcodes several display states:

- `conceal: false`
- `showTimestamps: false`
- `showDetails: true`
- `showGenericToolOutput: true`
- `diffWrapMode: "word"`

Upstream exposes toggles and persists the preferences.

### Desired fix

Either restore the upstream toggle state, or intentionally remove unsupported toggles from command lists and menus.

Recommended order:

1. restore `showDetails`;
2. restore `showTimestamps`;
3. restore `showGenericToolOutput`;
4. evaluate whether `conceal`, scrollbar, and diff wrapping still make sense in the minimal UI.

### Acceptance check

- Supported toggles change actual UI state.
- Unsupported toggles are not advertised.
- Toggle preferences survive session navigation/reload when upstream expects persistence.

## Priority 7: navigation, copy, and export commands

### Finding

Several upstream global/session navigation commands are still listed but are not obviously wired in opencode-vim:

- first/last message;
- previous/next message;
- last user message;
- copy selected messages;
- copy/export session transcript.

opencode-vim has its own Vim/copy mode, so some divergence may be intentional. The problem is not the divergence itself; the problem is advertising upstream commands that are not implemented.

### Desired fix

Audit each command and decide one of:

1. map it to the opencode-vim equivalent;
2. implement the upstream behavior;
3. remove it from opencode-vim command exposure.

### Acceptance check

- Command exposure matches actual behavior.
- Copy/export actions either work or are not shown.

## Priority 8: permission and question prompt directory

### Finding

Upstream passes the active session directory into `PermissionPrompt` and `QuestionPrompt`. opencode-vim currently only passes the request.

This may affect child sessions or multi-directory workflows where the prompt needs session directory context.

### Desired fix

Pass the corresponding session directory when rendering permission and question prompts.

### Acceptance check

- Permission prompts still work in the main session.
- Permission prompts from child/background sessions show/use the correct directory context.

## Suggested implementation order

1. Fix dead leader-visible commands.
2. Restore task hints and retry action dialog.
3. Restore user message metadata and message detail interaction.
4. Restore undo/redo UI.
5. Reconcile display toggles.
6. Reconcile navigation/copy/export commands.
7. Add directory context to permission/question prompts.

## Reviewer notes

Treat upstream `packages/tui/src/routes/session/index.tsx` as the behavior reference, but do not copy the full upstream layout back into opencode-vim. The goal is behavioral parity where users depend on it, while preserving the minimal/Vim-oriented presentation.

When a behavior is intentionally excluded, document the exclusion and remove visible command/menu exposure so it does not become a silent broken action.
