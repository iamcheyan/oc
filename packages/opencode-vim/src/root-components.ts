import oceanblack from "./theme/oceanblack.json" with { type: "json" }
import { addTheme } from "@tui/context/theme"
import { installCjkSafeOverlayPatch } from "./sdk/install-cjk-safe-overlay"

export function installMinimalRootComponents() {
  installCjkSafeOverlayPatch()
  addTheme("oceanblack", oceanblack)
}