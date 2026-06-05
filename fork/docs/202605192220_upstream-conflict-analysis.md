# Upstream Conflict Analysis

Date: 2026-05-19

## Current Upstream Modifications

### 1. TUI Core Files (High Conflict Risk)

#### `packages/opencode/src/cli/cmd/tui/app.tsx`

Changes:
- Added `OPENCODE_TUI_ROOT_COMPONENTS` global declaration for injecting minimal Home/Session
- Added minimal renderer config (screenMode, footerHeight)
- Removed `session.cycle_recent` and `session.cycle_recent_reverse` commands
- Simplified `appBindingCommands` array

Conflict Risk: HIGH (upstream modifies this file frequently)
Necessity: REQUIRED (minimal needs to replace Home/Session views)

#### `packages/opencode/src/cli/cmd/tui/context/minimal.ts`

Changes:
- New file with env var readers for minimal mode

Conflict Risk: LOW (new file, upstream doesn't have this)
Necessity: REQUIRED (minimal mode needs these configs)

#### `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

Changes:
- Exported 9 functions/consts (context, use, UserMessage, TextPart, ReasoningPart, ToolPart, InlineTool, BlockTool, Diagnostics)
- Added thinkingMode logic
- Modified ReasoningPart for collapse feature

Conflict Risk: HIGH (large file, upstream-active)
Necessity: REQUIRED (minimal reuses these components)

### 2. Prompt Component Files (Medium Conflict Risk)

#### `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

Changes:
- Added `compact` prop with conditional rendering

Conflict Risk: MEDIUM (prompt is relatively stable)
Necessity: REQUIRED (minimal needs compact prompt style)

#### `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`

Changes:
- Modified autocomplete height calculation

Conflict Risk: MEDIUM
Necessity: REQUIRED (minimal needs fixed height autocomplete)

### 3. Other Upstream Files (Low-Medium Conflict Risk)

#### `packages/opencode/src/cli/cmd/tui/keymap.tsx`

Changes:
- Added 2 lines

Conflict Risk: LOW
Necessity: MAYBE REQUIRED (needs further analysis)

#### `packages/opencode/src/cli/cmd/tui/routes/home.tsx`

Changes:
- Modified 2 lines

Conflict Risk: LOW
Necessity: MAYBE REQUIRED (needs further analysis)

## Conflict Reduction Strategies

### Short-term (Current Version)

1. **Keep minimal.ts** - New file, no upstream conflicts
2. **Keep session/index.tsx exports** - Don't change upstream logic
3. **Keep app.tsx minimal injection** - Core minimal functionality

### Long-term (Future Versions)

1. **Move more minimal logic to packages/opencode-vim**
   - Move session rendering completely to minimal package
   - Move prompt styling completely to minimal package

2. **Reduce upstream file modifications**
   - Keep only necessary exports and config injection
   - Encapsulate all UI logic in minimal package

3. **Establish conflict detection mechanism**
   - Add conflict detection in fork/update.sh
   - Run conflict detection script in CI

## File Conflict Risk Assessment

| File | Risk | Necessity | Recommendation |
|------|------|-----------|----------------|
| `packages/opencode/src/cli/cmd/tui/app.tsx` | HIGH | REQUIRED | Keep, minimize changes |
| `packages/opencode/src/cli/cmd/tui/context/minimal.ts` | LOW | REQUIRED | Keep as-is |
| `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` | HIGH | REQUIRED | Keep exports only |
| `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` | MEDIUM | REQUIRED | Keep compact prop |
| `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx` | MEDIUM | REQUIRED | Keep height calc |
| `packages/opencode/src/cli/cmd/tui/keymap.tsx` | LOW | MAYBE | Analyze further |
| `packages/opencode/src/cli/cmd/tui/routes/home.tsx` | LOW | MAYBE | Analyze further |

## Summary

Current upstream modifications are necessary but can be optimized:
1. Keep minimal.ts - core minimal config
2. Keep session/index.tsx exports - components minimal reuses
3. Keep app.tsx minimal injection - core minimal functionality
4. Move more minimal logic to packages/opencode-vim to reduce upstream changes

These strategies minimize conflicts while maintaining minimal mode functionality.
