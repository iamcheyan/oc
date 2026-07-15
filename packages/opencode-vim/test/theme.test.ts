import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"

describe("minimal theme overrides", () => {
  test("applyMinimalThemeOverrides makes background transparent and keeps selection text", async () => {
    const prev = process.env.OPENCODE_MINIMAL
    process.env.OPENCODE_MINIMAL = "1"

    const { applyMinimalThemeOverrides } = await import("../src/util/theme-minimal")

    const opaque = RGBA.fromInts(10, 20, 30, 255)
    const theme = {
      background: opaque,
      selectedListItemText: opaque,
      _hasSelectedListItemText: true,
    }

    const patched = applyMinimalThemeOverrides(theme)
    expect(patched.background.a).toBe(0)
    expect(patched.selectedListItemText).toBe(opaque)
    expect(patched._hasSelectedListItemText).toBe(true)

    process.env.OPENCODE_MINIMAL = prev
  })

  test("applyMinimalThemeOverrides preserves missing selected text fallback state", async () => {
    const prev = process.env.OPENCODE_MINIMAL
    process.env.OPENCODE_MINIMAL = "1"

    const { applyMinimalThemeOverrides } = await import("../src/util/theme-minimal")

    const fallback = RGBA.fromInts(0, 0, 0, 255)
    const patched = applyMinimalThemeOverrides({
      background: fallback,
      selectedListItemText: fallback,
      _hasSelectedListItemText: false,
    })

    expect(patched.background.a).toBe(0)
    expect(patched.selectedListItemText).toBe(fallback)
    expect(patched._hasSelectedListItemText).toBe(false)

    process.env.OPENCODE_MINIMAL = prev
  })
})
