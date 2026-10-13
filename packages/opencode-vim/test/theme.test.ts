import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"

describe("minimal theme overrides", () => {
  test("applyMinimalThemeOverrides makes background transparent and keeps selection text", async () => {
    const prev = process.env.OPENCODE_MINIMAL
    process.env.OPENCODE_MINIMAL = "1"

    const { applyMinimalThemeOverrides } = await import("../src/util/theme-minimal")

    const opaque = RGBA.fromInts(10, 20, 30, 255)
    const patched = applyMinimalThemeOverrides({
      background: { base: opaque, raised: { base: opaque, high: opaque, max: opaque }, action: {}, formfield: {}, feedback: {} },
      text: { base: opaque, muted: opaque, action: {}, formfield: {}, feedback: {} },
      border: { base: opaque },
      scrollbar: { base: opaque },
    })
    expect(patched.background.base.a).toBe(0)
    expect(patched.background.raised.base).toBe(opaque)

    process.env.OPENCODE_MINIMAL = prev
  })

  test("applyMinimalThemeOverrides preserves missing selected text fallback state", async () => {
    const prev = process.env.OPENCODE_MINIMAL
    process.env.OPENCODE_MINIMAL = "1"

    const { applyMinimalThemeOverrides } = await import("../src/util/theme-minimal")

    const fallback = RGBA.fromInts(0, 0, 0, 255)
    const patched = applyMinimalThemeOverrides({
      background: { base: fallback, raised: { base: fallback, high: fallback, max: fallback }, action: {}, formfield: {}, feedback: {} },
      text: { base: fallback, muted: fallback, action: {}, formfield: {}, feedback: {} },
      border: { base: fallback },
      scrollbar: { base: fallback },
    })

    expect(patched.background.base.a).toBe(0)
    expect(patched.background.raised.base).toBe(fallback)

    process.env.OPENCODE_MINIMAL = prev
  })
})
