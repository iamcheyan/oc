import { MinimalHome } from "./routes/home"
import { MinimalSession } from "./routes/session"
import { applyMinimalModeDefaults } from "./runtime"
import { MODEL_FREE_ONLY_ENV } from "./config/model-filter"
import { installCjkSafeOverlayPatch } from "./sdk/install-cjk-safe-overlay"
import { DEFAULT_THEMES } from "../../tui/src/theme/index"
import oceanblack from "./theme/oceanblack.json"

type MinimalRootComponents = {
  Home: typeof MinimalHome
  Session: typeof MinimalSession
}

export function installMinimalRootComponents(
  target: typeof globalThis & { OPENCODE_TUI_ROOT_COMPONENTS?: MinimalRootComponents } = globalThis,
) {
  applyMinimalModeDefaults()
  if (process.argv.includes("--free")) {
    process.env[MODEL_FREE_ONLY_ENV] = "1"
  }
  installCjkSafeOverlayPatch()
  if (!DEFAULT_THEMES.oceanblack) {
    DEFAULT_THEMES.oceanblack = oceanblack as (typeof DEFAULT_THEMES)[string]
  }
  target.OPENCODE_TUI_ROOT_COMPONENTS = {
    Home: MinimalHome,
    Session: MinimalSession,
  }
}
