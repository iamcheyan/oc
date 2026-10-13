import { RGBA } from "@opentui/core"
import { createEffect, createMemo } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useThemes } from "@tui/context/theme"
import { isMinimalTuiEnabled } from "@/context/minimal"
import { applyMinimalThemeOverrides, type MinimalThemeShape } from "@/util/theme-minimal"

export function useForkTheme() {
  const themes = useThemes()
  const theme = createMemo(() => applyMinimalThemeOverrides(themes.current as typeof themes.current & MinimalThemeShape))
  return {
    get theme() {
      return theme()
    },
    get syntax() {
      return themes.currentSyntax()
    },
  }
}

export function MinimalRendererBackground() {
  const renderer = useRenderer()
  const { theme } = useForkTheme()
  createEffect(() => {
    if (!isMinimalTuiEnabled()) return
    renderer.setBackgroundColor(theme.background.base)
  })
  return null
}

export function selectedForeground(theme: { text: { base: RGBA; muted: RGBA } }, background: RGBA = RGBA.fromInts(0, 0, 0)) {
  const luminance = (color: RGBA) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  return luminance(background) > 0.5 ? theme.text.base : theme.text.muted
}

export { tint } from "@tui/theme/color"
