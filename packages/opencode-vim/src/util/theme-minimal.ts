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

  const selectedListItemText = theme._hasSelectedListItemText ? theme.selectedListItemText : theme.background

  return {
    ...theme,
    background: TRANSPARENT_BACKGROUND,
    selectedListItemText,
    _hasSelectedListItemText: true,
  }
}