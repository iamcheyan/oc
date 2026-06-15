# Compact Prompt Patch Pattern

## Purpose

This document records the fork's modifications to upstream TUI prompt files for
compact/minimal mode support, so future merge conflicts can be resolved
quickly.

## Principle

All upstream changes are purely additive: we wrap existing JSX in
`<Show when={props.compact}>` / `<Show when={!props.compact}>` conditionals
and add one optional `compact?: boolean` prop.  No upstream logic is removed
or rewritten — only hidden behind a condition that defaults to `undefined`
(falsy) so existing callers see zero change.

## Modified Files

### `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

| Line(s) | What | Pattern |
|---------|------|---------|
| Props interface | Added `compact?: boolean` | Pure addition |
| L1479-1493 | Border, padding, background, `flexShrink` |`<Show when={!props.compact}>` around border array and `compact ? … : …` ternaries |
| L1495-1501 | `» ` prompt indicator + thinking spinner | `<Show when={props.compact}>` |
| L1500 | Placeholder text suppressed | `placeholder={props.compact ? undefined : placeholderText()}` |
| L1507 | `flexGrow={1}` on textarea | Always-on (needed for right-aligned usage) |
| L1510-1520 | Context usage indicator (right side of input) | `<Show when={usage()}>` — always shows when data exists |
| L1612-1639 | Bottom border decoration | `<Show when={!props.compact}>` |
| L1643-1801 | Whole status bar (spinner, retry text, interrupt, agents/commands hints) | `<Show when={!props.compact}>` |
| L1778-1790 | Agents / commands keyboard hints | `<Match when={!props.compact}>` / `<Show when={!props.compact}>` |

### `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`

| Line(s) | What |
|---------|------|
| L803-808 | Autocomplete height set to fixed `Math.min(15, count)` (removed `anchor().y` constraint) |

### `packages/opencode-vim/src/routes/home.tsx`

| Line(s) | What |
|---------|------|
| L72 | `<Prompt compact>` flag, no help text line |

### `packages/opencode-vim/src/routes/session.tsx`

| Line(s) | What |
|---------|------|
| L391 | `<Prompt compact>` flag, controls spacer, sticky-to-bottom |

### `packages/opencode-vim/src/component/header.tsx`

| Line(s) | What |
|---------|------|
| Entire file | Replaced upstream `Header` with `MinimalHeader` (no help text) |

## Merge Conflict Resolution

When `fork/update.sh` produces conflicts in `prompt/index.tsx`:

1. **Accept upstream** for the conflicting hunks (we want upstream logic).
2. **Re-wrap** with `<Show when={!props.compact}>` / `compact ? … : …` if the
   upstream change affects an area we previously wrapped.
3. **Check** that these fork-specific constructs still exist after resolution:
   - `compact?: boolean` in the PromptProps interface
   - `props.compact` conditionals around: border, padding, bg, `» `, status bar,
     agents/commands hints
   - `flexGrow={1}` on textarea
   - The usage indicator (`<Show when={usage()}>`) after textarea

For conflicts in `autocomplete.tsx`, just ensure the height formula stays
`Math.min(15, count)` (no `anchor().y` constraint).

## Quick Checklist After Upstream Merge

```bash
grep -n 'props.compact' packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx
# Should see ~10 matches — if any disappeared, re-apply the pattern.

grep -n 'flexGrow={1}' packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx
# Should match the textarea.

grep -n 'Math.min(15' packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx
# Should match the height memo.
```
