import { MinimalHome } from "./routes/home"
import { MinimalSession } from "./routes/session"
import oceanblack from "./theme/oceanblack.json" with { type: "json" }
import { addTheme } from "@tui/context/theme"

export function installMinimalRootComponents(target: typeof globalThis = globalThis) {
  target.OPENCODE_TUI_ROOT_COMPONENTS = {
    Home: MinimalHome,
    Session: MinimalSession,
  }
  addTheme("oceanblack", oceanblack)
}
