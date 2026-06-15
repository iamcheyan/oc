# Vim TUI: Self-Rendered Session Architecture

Date: 2026-05-19

## Motivation

The fork's Vim TUI (`packages/opencode-vim/`) needs compact rendering
(UserMessage without left border, AssistantMessage with minimal padding,
no scrollbar, no sidebar) while minimizing upstream `packages/opencode/src/`
modifications to reduce future merge conflicts.

## Prior approaches

| Approach | Upstream seam | Problem |
|---|---|---|
| ~30 env ternaries (`isMinimalTuiEnabled()`) | ~30 lines in 3 files | Every line can conflict on merge |
| ~5 injection points (`OPENCODE_TUI_RENDER_OVERRIDES`) | ~5 lines | Cleaner, but still touch upstream |
| **Self-rendered Session** (this doc) | **9 `export` keywords** | No logic changes, merge-safe |

## Architecture

### What `opencode-repl` taught us

`packages/opencode-repl/` has zero merge conflicts with upstream because it
never imports `packages/opencode/src/cli/cmd/tui/**`. It depends only on
`@opencode-ai/core` (SDK) and implements its own readline-based CLI.

The Vim TUI cannot go that far — it wants the TUI rendering stack (ink,
scrollbox, markdown, theme). But it can borrow the principle: **own the
session rendering in your own package; treat upstream as a library of
importable components.**

### Component dependency graph

```
packages/opencode-vim/
  MinimalSession()                    ← owns scrollbox, message loop, layout
    ├── CompactAssistantMessage()     ← compact part loop + compact footer
    │    ├── TextPart()               ← imported from upstream (exported)
    │    ├── ReasoningPart()          ← imported from upstream (exported)
    │    └── ToolPart()               ← imported from upstream (exported)
    │         ├── Shell / Glob / …    ← private in upstream, called via closure
    │         ├── InlineTool()        ← imported from upstream (exported)
    │         ├── BlockTool()         ← imported from upstream (exported)
    │         └── Diagnostics()       ← imported from upstream (exported)
    ├── UserMessage()                 ← imported from upstream (exported)
    ├── PermissionPrompt / QuestionPrompt / SubagentFooter  ← imported
    └── Prompt                        ← imported from @tui/component/prompt
```

### Upstream changes (session/index.tsx)

9 functions/consts changed from unexported to exported:

| Symbol | Kind | Why exported |
|---|---|---|
| `context` | `createContext(...)` | MinimalSession provides its own `<context.Provider>` |
| `use()` | context accessor | Compact* components read session context |
| `UserMessage` | component | Reused as-is in MinimalSession |
| `TextPart` | component | Reused in CompactAssistantMessage |
| `ReasoningPart` | component | Reused in CompactAssistantMessage |
| `ToolPart` | component | Reused in CompactAssistantMessage |
| `InlineTool` | component | Called by ToolPart (via closure) |
| `BlockTool` | component | Called by ToolPart (via closure) |
| `Diagnostics` | component | Called by tool renderers (via closure) |

No logic changes — only adding the `export` keyword. Upstream callers within
the same file are unaffected.

### What MinimalSession does differently

| Aspect | Upstream Session | MinimalSession |
|---|---|---|
| Outer container | `paddingBottom={1} paddingLeft={2} gap={1}` | No padding, no gap |
| Top spacer | `<box height={1} />` | Removed |
| Sidebar | Conditional `<Sidebar>` | Removed |
| Scrollbar | `verticalScrollbarOptions` with track | Removed |
| UserMessage | Left border, marginTop | Upstream UserMessage (no wrapper) |
| AssistantMessage | Border, padding, subagent shortcut | CompactAssistantMessage |
| Error display | Border + background panel | Plain `<text fg={error}>` |
| Message footer | Multi-line agent+mode+duration | Single-line compact |

### File map

```
# New/rewritten in opencode-vim:
packages/opencode-vim/src/routes/session.tsx    ← MinimalSession + CompactAssistantMessage

# Modified in upstream (export only):
packages/opencode/src/cli/cmd/tui/routes/session/index.tsx  ← 9× export keyword
```

### Merge conflict profile

When upstream changes `session/index.tsx`, the 9 export lines have extremely
low conflict probability — they conflict only if upstream simultaneously
renames/deletes the same functions. The MinimalSession is self-contained in
`packages/opencode-vim/` and never sees those conflicts.

## Future directions

- `CompactUserMessage` — if user-message styling needs to diverge further,
  build it in opencode-vim instead of importing upstream UserMessage.
- Keyboard bindings — MinimalSession currently omits `useBindings`.
  Can be added as a follow-up.
- Session children/fork navigation — MinimalSession currently shows
  SubagentFooter but does not implement parent/child navigation.
