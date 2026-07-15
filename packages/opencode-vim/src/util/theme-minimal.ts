import { RGBA } from "@opentui/core"
import { isMinimalTuiEnabled } from "@/context/minimal"

const TRANSPARENT_BACKGROUND = RGBA.fromInts(0, 0, 0, 0)

export type MinimalThemeShape = {
  background: RGBA
  selectedListItemText: RGBA
  _hasSelectedListItemText: boolean
}

export function applyMinimalThemeOverrides<T extends MinimalThemeShape>(theme: T): T {
  if (!isMinimalTuiEnabled()) return theme

  return {
    ...theme,
    background: TRANSPARENT_BACKGROUND,
    selectedListItemText: theme.selectedListItemText,
    _hasSelectedListItemText: theme._hasSelectedListItemText,
  }
}
