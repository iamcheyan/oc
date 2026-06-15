export function isMinimalTuiEnabled() {
  return process.env.OPENCODE_MINIMAL === "1"
}

export function minimalTuiThemeDefault() {
  return process.env.OPENCODE_MINIMAL_THEME || "minimal"
}

export function minimalTuiAnimationsDefault() {
  return process.env.OPENCODE_MINIMAL_ANIMATIONS === "1"
}

export function minimalTuiSidebarDefault() {
  return process.env.OPENCODE_MINIMAL_SIDEBAR === "hide" ? "hide" : "auto"
}

export function minimalTuiScreenMode() {
  if (process.env.OPENCODE_MINIMAL_SCREEN_MODE === "split-footer") return "split-footer"
  if (process.env.OPENCODE_MINIMAL_SCREEN_MODE === "main-screen") return "main-screen"
  return undefined
}

export function minimalTuiFooterHeight() {
  const value = Number(process.env.OPENCODE_MINIMAL_FOOTER_HEIGHT)
  if (!Number.isFinite(value)) return undefined
  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : undefined
}
