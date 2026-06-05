import { expect, test } from "vitest"
import { Context, Box, Text, RGBA } from "@opentui/core"

test("cjk bug", () => {
  const ctx = new Context({ width: 20, height: 2, enableLayout: true })
  const root = new Box(ctx, { width: 20, height: 2, backgroundColor: "#151515" })
  ctx.root = root

  const overlay = new Box(ctx, {
    position: "absolute",
    top: 0,
    left: 0,
    width: 20,
    height: 1,
    backgroundColor: RGBA.fromInts(0, 0, 0, 40)
  })
  root.add(overlay)

  const text = new Text(ctx, { text: "中文测试 English", fg: "#CCCCCC" })
  root.add(text)

  ctx.render()
  const lines = ctx.getSpanLines()
  for (const span of lines[0]) {
    console.log(`Span: '${span.text}' w: ${span.width}`)
  }
  expect(true).toBe(true)
})
