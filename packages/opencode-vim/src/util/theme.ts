import { createEffect } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useTheme as useUpstreamTheme } from "@tui/context/theme"
import { isMinimalTuiEnabled } from "@/context/minimal"
import { applyMinimalThemeOverrides } from "@/util/theme-minimal"

type ResolvedTheme = ReturnType<typeof useUpstreamTheme>["theme"]

export function useForkTheme() {
  const ctx = useUpstreamTheme()
  return {
    ...ctx,
    get theme() {
      return applyMinimalThemeOverrides(ctx.theme)
    },
  }
}

export function MinimalRendererBackground() {
  const renderer = useRenderer()
  const { theme } = useForkTheme()

  createEffect(() => {
    if (!isMinimalTuiEnabled()) return
    renderer.setBackgroundColor(theme.background)
  })

  return null
}

export { selectedForeground, tint } from "@tui/context/theme"