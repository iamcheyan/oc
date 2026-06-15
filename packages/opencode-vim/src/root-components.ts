import { MinimalHome } from "./routes/home"
import { MinimalSession } from "./routes/session"
import oceanblack from "./theme/oceanblack.json" with { type: "json" }
import { addTheme } from "@tui/context/theme"

declare global {
  var OPENCODE_TUI_ROOT_COMPONENTS:
    | {
        Home?: typeof MinimalHome
        Session?: typeof MinimalSession
      }
    | undefined
}

export function installMinimalRootComponents(target: typeof globalThis = globalThis) {
  target.OPENCODE_TUI_ROOT_COMPONENTS = {
    Home: MinimalHome,
    Session: MinimalSession,
  }
  addTheme("oceanblack", oceanblack)
}
