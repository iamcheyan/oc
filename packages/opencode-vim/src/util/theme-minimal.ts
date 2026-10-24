import { RGBA } from "@opentui/core"
import { isMinimalTuiEnabled } from "../context/minimal"

const TRANSPARENT_BACKGROUND = RGBA.fromInts(0, 0, 0, 0)

export type MinimalThemeShape = {
  background: {
    base: RGBA
    raised: { base: RGBA; high: RGBA; max: RGBA }
    action: Record<string, unknown>
    formfield: unknown
    feedback: Record<string, unknown>
  }
  text: {
    base: RGBA
    muted: RGBA
    action: Record<string, unknown>
    formfield: unknown
    feedback: Record<string, unknown>
  }
  border: { base: RGBA }
  scrollbar: { base: RGBA }
}

export function applyMinimalThemeOverrides<T extends MinimalThemeShape>(theme: T): T {
  if (!isMinimalTuiEnabled()) return theme
  return {
    ...theme,
    background: {
      ...theme.background,
      base: TRANSPARENT_BACKGROUND,
    },
  }
}
