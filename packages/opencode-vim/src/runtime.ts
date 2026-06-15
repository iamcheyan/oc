export type MinimalModeDefaults = {
  animationsEnabled: boolean
  preferredTheme: string
  sidebarMode: "hide"
  screenMode: "main-screen"
  footerHeight?: number
  logLevel: "WARN" | "ERROR"
}

export const MINIMAL_MODE_DEFAULTS: MinimalModeDefaults = {
  animationsEnabled: false,
  preferredTheme: "opencode",
  sidebarMode: "hide",
  screenMode: "main-screen",
  logLevel: "WARN",
}

export function applyMinimalModeDefaults(env: NodeJS.ProcessEnv = process.env) {
  env.OPENCODE_MINIMAL = "1"
  env.OPENCODE_MINIMAL_THEME ??= MINIMAL_MODE_DEFAULTS.preferredTheme
  env.OPENCODE_MINIMAL_ANIMATIONS ??= MINIMAL_MODE_DEFAULTS.animationsEnabled ? "1" : "0"
  env.OPENCODE_MINIMAL_SIDEBAR ??= MINIMAL_MODE_DEFAULTS.sidebarMode
  env.OPENCODE_MINIMAL_SCREEN_MODE ??= MINIMAL_MODE_DEFAULTS.screenMode
  env.OPENCODE_MINIMAL_DISABLE_UPDATE_CHECK ??= "1"
  if (MINIMAL_MODE_DEFAULTS.footerHeight !== undefined) {
    env.OPENCODE_MINIMAL_FOOTER_HEIGHT ??= String(MINIMAL_MODE_DEFAULTS.footerHeight)
  }
  env.OPENCODE_MINIMAL_LOG_LEVEL ??= MINIMAL_MODE_DEFAULTS.logLevel
  return env
}
