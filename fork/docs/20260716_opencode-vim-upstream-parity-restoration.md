# opencode-vim upstream parity restoration

Date: 2026-07-16

## Summary

This pass restored the main upstream session behaviors that were lost or only partially wired after the `opencode-vim` minimal session refactor.

The implementation intentionally keeps the minimal/Vim-oriented screen. It does not restore the full upstream layout. The goal was to make visible commands, shortcut hints, dialogs, and session state behave consistently again.

## Completed fixes

### 1. Session command handlers

Restored handlers for user-visible session commands:

- `session.share`
- `session.unshare`
- `session.rename`
- `session.timeline`
- `session.fork`
- `session.compact`
- `session.undo`
- `session.redo`

These commands are now registered in the session route instead of only being listed in keybindings or the leader menu.

Suggested commit:

```text
fix(opencode-vim): restore session command handlers
```

### 2. Task/subagent hints and retry actions

Restored the assistant task hint shown when a message contains a `task` tool part:

- shortcut to view subagents;
- shortcut to background running subagents when supported.

Also restored the upstream retry action dialog flow for retry events that carry an action, including the existing suppression keys for opencode free-tier/account-rate-limit upsells.

Suggested commit:

```text
fix(opencode-vim): restore task hints and retry actions
```

### 3. Compact user message metadata

Expanded `CompactUserMessage` while keeping the compact presentation:

- file and directory chips are visible again;
- queued prompts show a `QUEUED` marker;
- compaction boundaries render as a separator;
- timestamp display is wired to the session timestamp toggle;
- clicking a user message opens `DialogMessage`.

Suggested commit:

```text
fix(opencode-vim): restore compact user message metadata
```

### 4. Revert UI

Restored visible revert state:

- reverted messages are hidden after the revert boundary;
- a compact revert panel is shown;
- the panel shows reverted message count;
- diff file summaries show additions/deletions;
- redo/unrevert is reachable from the panel and the `session.redo` command.

Suggested commit:

```text
fix(opencode-vim): restore revert panel
```

### 5. Display toggle state

Replaced hardcoded session display values with live state:

- `session.toggle.conceal`
- `session.toggle.timestamps`
- `session.toggle.actions`
- `session.toggle.generic_tool_output`
- `session.toggle.scrollbar`

The toggles now update actual UI state. Existing upstream KV keys are reused where applicable.

Suggested commit:

```text
fix(opencode-vim): restore display toggle state
```

### 6. Navigation, copy, and export commands

Restored additional listed session commands:

- `session.first`
- `session.last`
- `session.messages_last_user`
- `session.message.next`
- `session.message.previous`
- `messages.copy`
- `session.copy`
- `session.export`

`session.copy` and `session.export` use the upstream transcript formatter.

Suggested commit:

```text
fix(opencode-vim): restore session navigation and transcript commands
```

### 7. Permission/question directory context

Restored session directory context for:

- `PermissionPrompt`
- `QuestionPrompt`

This matters for child sessions and workflows where permission/question replies need the originating session directory.

Suggested commit:

```text
fix(opencode-vim): preserve prompt directory context
```

### 8. Pure mode session command

The leader menu exposes `vim.toggle.pureMode`, but the session route did not register it. The session route now matches the home route behavior and writes the same `minimal_pure_mode` KV key.

Suggested commit:

```text
fix(opencode-vim): register pure mode session command
```

## Verification

Ran from `packages/opencode-vim`:

```text
bun typecheck
bun test
```

Result:

- typecheck passed;
- 12 tests passed;
- 0 tests failed.

## Commit note

The requested "one fix, one commit" workflow could not be completed in this environment because `.git` is mounted read-only. `git commit` failed when trying to create `.git/index.lock`.

The code changes are still grouped in this document with suggested commit messages so they can be committed in order once `.git` is writable.

## Remaining watch points

The restored behavior is concentrated in `packages/opencode-vim/src/routes/session.tsx`.

Future upstream syncs should continue checking this file against `packages/tui/src/routes/session/index.tsx`, especially around:

- new session command ids;
- new retry/session status behavior;
- message part rendering changes;
- permission/question prompt API changes;
- transcript/export behavior.
