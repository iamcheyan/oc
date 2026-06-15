import { createCliRenderer } from "@opentui/core"
import { createTestUI, P } from "./api-test-ui"

async function main() {
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    backgroundColor: P.bg,
  })

  const ui = createTestUI(renderer)
  renderer.root.add(ui.root)

  // Hide cursor
  renderer.setCursorPosition(0, 0, false)

  // Setup keyboard
  renderer.keyInput.on("keypress", (key: { name: string; shift?: boolean; ctrl?: boolean }) => {
    if (key.name === "escape" || key.name === "q") {
      ui.destroy()
      renderer.destroy()
      process.exit(0)
    }
    ui.handleKeyPress(key)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
