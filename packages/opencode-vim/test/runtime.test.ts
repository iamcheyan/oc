import { expect, test } from "bun:test"
import { applyMinimalModeDefaults } from "../src/runtime"

test("applyMinimalModeDefaults seeds minimal mode env without overriding explicit values", () => {
  const env: NodeJS.ProcessEnv = {
    OPENCODE_MINIMAL_THEME: "custom-minimal",
  }

  applyMinimalModeDefaults(env)

  expect(env.OPENCODE_MINIMAL).toBe("1")
  expect(env.OPENCODE_MINIMAL_THEME).toBe("custom-minimal")
  expect(env.OPENCODE_MINIMAL_ANIMATIONS).toBe("0")
  expect(env.OPENCODE_MINIMAL_SIDEBAR).toBe("hide")
  expect(env.OPENCODE_MINIMAL_SCREEN_MODE).toBe("main-screen")
  expect(env.OPENCODE_MINIMAL_FOOTER_HEIGHT).toBeUndefined()
  expect(env.OPENCODE_MINIMAL_LOG_LEVEL).toBe("WARN")
})
