import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Part } from "@opencode-ai/sdk/v2"
import { displayCharAt } from "@opencode/cli/cmd/prompt-display"

export type CopyRow = {
  key: string
  id: string
  role: "user" | "assistant"
  kind: "user" | "text" | "reasoning" | "tool"
  part?: string
  tool?: string
  line: number
  y: number
  col: number
}

export type CopyCursor = {
  text: string
  start: number
  width: number
}

const segmenter = new Intl.Segmenter()

export function createCopyMode(input: {
  scroll: () => ScrollBoxRenderable | undefined
  messages: Accessor<{ id: string; role: string }[]>
  parts: (id: string) => Part[]
  thinking: () => boolean
  details: () => boolean
}) {
  const [active, setActive] = createSignal(false)
  const [idx, setIdx] = createSignal(-1)
  const [col, setCol] = createSignal(0)
  const [stick, setStick] = createSignal<undefined | "start" | "first" | "end" | number>("first")
  const [follow, setFollow] = createSignal(false)
  let lastCursor: CopyRow | undefined

  function collectNodes() {
    const scroll = input.scroll()
    if (!scroll) return []
    const result: any[] = []
    const visit = (node: any) => {
      if (!node) return
      if (node.id) result.push(node)
      for (const child of node.getChildren?.() ?? []) {
        if (child._positionType === "absolute") continue
        visit(child)
      }
    }
    for (const child of scroll.getChildren()) visit(child)
    return result.toSorted((a, b) => a.y - b.y)
  }

  function rows(): CopyRow[] {
    const scroll = input.scroll()
    if (!scroll) return []

    const meta = new Map<
      string,
      {
        role: "user" | "assistant"
        kind: "user" | "text" | "reasoning" | "tool"
        part?: string
        tool?: string
      }
    >()

    for (const msg of input.messages()) {
      const parts = input.parts(msg.id)
      if (msg.role === "user") {
        meta.set(msg.id, { role: "user", kind: "user" })
        continue
      }
      for (const part of parts) {
        if (part.type === "text") meta.set(`text-${part.id}`, { role: "assistant", kind: "text", part: part.id })
        if (part.type === "reasoning") {
          if (!input.thinking()) continue
          meta.set(`text-${part.id}`, { role: "assistant", kind: "reasoning", part: part.id })
        }
        if (part.type === "tool") {
          if (!input.details() && part.state.status === "completed") continue
          meta.set(`tool-${part.id}`, { role: "assistant", kind: "tool", part: part.id, tool: part.tool })
        }
      }
    }

    return collectNodes()
      .flatMap((child) => {
        if (!child.id) return []
        const m = meta.get(child.id)
        if (!m) return []

        const total = Math.max(1, Math.floor(child.height))
        const start = 0
        const end = total
        const baseCol = m.kind === "user" ? 1 : 0

        return Array.from({ length: Math.max(0, end - start) }, (_, i) => ({
          key: `${m.kind}:${child.id}:${i}`,
          id: child.id!,
          role: m.role,
          kind: m.kind,
          part: m.part,
          tool: m.tool,
          line: i,
          y: child.y + start + i,
          col: baseCol,
        }))
      })
  }

  function findRenderables(node: any, y = 0, gutter = 0): { node: any; y: number; gutter: number }[] {
    if (node.lineInfo && node.plainText !== undefined) return [{ node, y, gutter }]
    const width = gutter || ("gutter" in node && node.gutter ? node.gutter.calculateWidth() : 0)
    const result: { node: any; y: number; gutter: number }[] = []
    for (const child of node.getChildren?.() ?? []) {
      if (child._positionType === "absolute") continue
      result.push(...findRenderables(child, y + Math.floor(child._y ?? 0), width))
    }
    return result
  }

  function sliceCols(text: string, start: number, width: number): string {
    if (start === 0 && width >= Bun.stringWidth(text)) return text
    let col = 0
    let begin = -1
    let end = text.length
    for (const seg of segmenter.segment(text)) {
      const w = Bun.stringWidth(seg.segment)
      if (begin < 0 && col + w > start) begin = seg.index
      col += w
      if (col >= start + width) {
        end = seg.index + seg.segment.length
        break
      }
    }
    if (begin < 0) begin = 0
    return text.slice(begin, end)
  }

  function childById(id: string, cache?: Map<string, any>) {
    if (cache) return cache.get(id)
    return collectNodes().find((c) => c.id === id)
  }

  function copyLine(row: CopyRow, child: any): { text: string; col: number } {
    const entries = findRenderables(child)
    if (!entries.length) return { text: "", col: 0 }
    let match = entries[0]
    for (const entry of entries) {
      if (entry.y > row.line) break
      match = entry
    }
    if (typeof match.node.plainText !== "string") return { text: "", col: 0 }
    const local = row.line - match.y
    const lines = match.node.plainText.split("\n")
    const info = match.node.lineInfo
    if (info?.lineSources && local < info.lineSources.length) {
      const src = info.lineSources[local]
      const text = lines[src] ?? ""
      const wrapped =
        info.lineWraps?.[local] === 1 || info.lineSources[local - 1] === src || info.lineSources[local + 1] === src
      if (!wrapped) return { text, col: match.gutter }
      const lineStart = info.lineStartCols?.[local] ?? 0
      let base = lineStart
      for (let i = local - 1; i >= 0; i--) {
        if (info.lineSources[i] === src) base = info.lineStartCols?.[i] ?? base
        else break
      }
      const offset = lineStart - base
      const width = info.lineWidthCols?.[local] ?? Bun.stringWidth(text)
      return { text: sliceCols(text, offset, width), col: match.gutter }
    }
    if (local >= lines.length) return { text: "", col: match.gutter }
    return { text: lines[local] ?? "", col: match.gutter }
  }

  function rowText(row?: CopyRow, cache?: Map<string, any>) {
    if (!row) return ""
    const child = childById(row.id, cache)
    if (!child) return ""
    return copyLine(row, child).text
  }

  function copyMin(row?: CopyRow, cache?: Map<string, any>): number {
    if (!row) return 0
    const child = childById(row.id, cache)
    if (!child) return row.col
    const line = copyLine(row, child)
    return row.col + line.col
  }

  function rowPadded(row: CopyRow, cache?: Map<string, any>) {
    return " ".repeat(copyMin(row, cache)) + rowText(row, cache)
  }

  function resolveStick(row: CopyRow, nextStick: undefined | "start" | "first" | "end" | number) {
    const min = copyMin(row)
    const text = rowPadded(row)
    const max = text.length > 0 ? text.length - 1 : min
    if (nextStick === "start") return min
    if (nextStick === "first") {
      const first = text.trimStart()
      return text.length - first.length
    }
    if (nextStick === "end") return max
    if (typeof nextStick === "number") return Math.max(min, Math.min(max, min + nextStick))
    return Math.max(min, Math.min(max, col()))
  }

  function sync(next: number, direction?: "up" | "down" | "top" | "bottom") {
    const scroll = input.scroll()
    const list = rows()
    if (!scroll || !list.length) return

    // Special case: explicit jump to top - directly set scrollTop
    if (direction === "top") {
      if (scroll.scrollTop !== 0) {
        scroll.scrollTop = 0
      }
      const updatedList = rows()
      if (updatedList.length) {
        setIdx(0)
      }
      return
    }

    // Special case: explicit jump to actual bottom (not just last known row)
    // This handles streaming where new content is continuously added
    if (direction === "bottom") {
      // Directly set scrollTop to the maximum to jump to true bottom
      // scrollHeight includes all content, height is viewport size
      const targetScroll = Math.max(0, scroll.scrollHeight - scroll.height)
      if (scroll.scrollTop !== targetScroll) {
        scroll.scrollTop = targetScroll
      }
      // Re-collect rows after scroll to get the actual last row
      const updatedList = rows()
      if (updatedList.length) {
        const lastIdx = updatedList.length - 1
        setIdx(lastIdx)
      }
      return
    }

    const resolved = Math.max(0, Math.min(next, list.length - 1))

    // Vim-like scrolling: if current row is at screen edge and moving
    // in that direction, scroll before updating the index so the cursor
    // stays at the edge and doesn't disappear off screen.
    if (direction) {
      const currentRow = list[idx()]
      if (currentRow) {
        const top = scroll.scrollTop
        const bottom = scroll.scrollTop + scroll.height - 1
        if (direction === "up" && currentRow.y <= top && resolved < idx()) {
          scroll.scrollBy(-1)
        } else if (direction === "down" && currentRow.y >= bottom && resolved > idx()) {
          scroll.scrollBy(1)
        }
      }
    }

    setIdx(resolved)
    const row = list[resolved]
    if (!row) return

    // Clamp: ensure the new row is visible after scroll
    const y = row.y
    const top = scroll.scrollTop
    const bottom = scroll.scrollTop + scroll.height - 1
    if (y < top) {
      scroll.scrollBy(y - top)
    } else if (y > bottom) {
      scroll.scrollBy(y - bottom)
    }
  }

  function pickVisibleTarget(list: CopyRow[], preferBottom = false) {
    const scr = input.scroll()
    if (!scr) return 0
    const top = scr.scrollTop
    const bottom = scr.scrollTop + scr.height - 1
    const visible = list.filter((x) => x.y >= top && x.y <= bottom)
    if (!visible.length) return 0
    if (preferBottom) return list.indexOf(visible[visible.length - 1]!)
    const midY = top + (bottom - top) / 2
    return list.indexOf(visible.reduce((a, b) => (Math.abs(a.y - midY) < Math.abs(b.y - midY) ? a : b)))
  }

  function matchingTarget(list: CopyRow[], target: CopyRow) {
    const exact = list.map((row, nextIdx) => ({ row, nextIdx })).filter((x) => x.row.key === target.key)
    if (exact.length) return exact[0]!.nextIdx
    const candidates = list
      .map((row, nextIdx) => ({ row, nextIdx }))
      .filter((x) => x.row.id === target.id && x.row.kind === target.kind && x.row.role === target.role)
    if (!candidates.length) return -1
    return candidates.reduce((a, b) => (Math.abs(a.row.line - target.line) < Math.abs(b.row.line - target.line) ? a : b))
      .nextIdx
  }

  function enter() {
    const list = rows()
    if (!list.length) return
    setActive(true)
    const target = lastCursor ? matchingTarget(list, lastCursor) : pickVisibleTarget(list, true)
    const resolved = target >= 0 ? target : pickVisibleTarget(list, true)
    setIdx(resolved)
    const row = list[resolved]
    if (!row) return
    setStick("first")
    setCol(copyMin(row))
    const scroll = input.scroll()
    if (!scroll) return
    const top = scroll.scrollTop
    const bottom = scroll.scrollTop + scroll.height - 1
    if (row.y < top || row.y > bottom) {
      sync(resolved)
    }
  }

  function exit() {
    // 保存当前滚动位置，防止退出时重置
    const scroll = input.scroll()
    const savedScrollTop = scroll?.scrollTop
    
    lastCursor = row()
    setFollow(false)
    setActive(false)
    
    // 恢复滚动位置
    if (scroll && savedScrollTop !== undefined) {
      queueMicrotask(() => {
        if (scroll.scrollTop !== savedScrollTop) {
          scroll.scrollTop = savedScrollTop
        }
      })
    }
  }

  function move(action: "up" | "down" | "left" | "right") {
    if (!active()) return
    if (action === "up" || action === "down") {
      setFollow(false)
      const delta = action === "up" ? -1 : 1
      sync(idx() + delta, action)
      const nextRow = row()
      if (!nextRow) return
      setCol(resolveStick(nextRow, stick()))
      return
    }
    const currentRow = row()
    if (!currentRow) return
    const min = copyMin(currentRow)
    if (action === "left") {
      const next = Math.max(min, col() - 1)
      setCol(next)
      setStick(next - min)
      return
    }
    const text = rowPadded(currentRow)
    const max = text.length > 0 ? text.length - 1 : min
    const next = Math.min(max, col() + 1)
    setCol(next)
    setStick(next - min)
  }

  function jump(action: "top" | "bottom" | "high" | "middle" | "low") {
    const list = rows()
    const scr = input.scroll()
    if (!active() || !scr || !list.length) return
    if (action === "top") {
      setFollow(false)
      sync(0, "top")
      const nextRow = row()
      if (nextRow) setCol(copyMin(nextRow))
      return
    }
    if (action === "bottom") {
      setFollow(true)
      sync(list.length - 1, "bottom")
      const nextRow = row()
      if (nextRow) setCol(copyMin(nextRow))
      return
    }
    const top = scr.scrollTop
    const bottom = scr.scrollTop + scr.height - 1
    const first = list.findIndex((r) => r.y >= top && r.y <= bottom)
    const last = list.findLastIndex((r) => r.y >= top && r.y <= bottom)
    if (first < 0) return
    let target = first
    if (action === "low") target = last
    if (action === "middle") target = Math.round((first + last) / 2)
    setFollow(false)
    sync(target)
    const nextRow = row()
    if (nextRow) setCol(copyMin(nextRow))
  }

  function clamp(delta: number) {
    const scr = input.scroll()
    const list = rows()
    const currentIdx = idx()
    if (!active() || !scr || !list.length || currentIdx < 0) return
    setFollow(false)
    const currentRow = list[Math.max(0, Math.min(currentIdx, list.length - 1))]
    if (!currentRow) return
    const top = scr.scrollTop
    const bottom = scr.scrollTop + scr.height - 1
    if (currentRow.y >= top && currentRow.y <= bottom) return
    const first = list.findIndex((r) => r.y >= top && r.y <= bottom)
    const last = list.findLastIndex((r) => r.y >= top && r.y <= bottom)
    let target = -1
    if (currentRow.y < top && first >= 0) target = first
    if (currentRow.y > bottom && last >= 0) target = last
    if (target < 0 && delta > 0) {
      target = list.findIndex((r) => r.y > bottom)
    }
    if (target < 0 && delta < 0) {
      target = list.findLastIndex((r) => r.y < top)
    }
    if (target < 0) return
    setIdx(target)
    const nextRow = list[target]
    if (nextRow) setCol(resolveStick(nextRow, stick()))
  }

  createEffect(() => {
    if (!active() || !follow()) return
    const list = rows()
    if (!list.length) return
    const lastIdx = list.length - 1
    if (idx() !== lastIdx) {
      sync(lastIdx, "bottom")
    }
  })

  function setFromY(y: number) {
    const list = rows()
    if (!list.length) return
    let target = list.findIndex((row) => row.y === y)
    if (target < 0) {
      target = list.findLastIndex((row) => row.y <= y)
    }
    if (target < 0) target = 0
    setIdx(target)
    const nextRow = list[target]
    if (!nextRow) return
    setActive(true)
    setStick("first")
    setCol(copyMin(nextRow))
  }

  const row = createMemo(() => {
    if (!active()) return undefined
    return rows()[idx()]
  })

  const cursor = createMemo<CopyCursor>(() => {
    const currentRow = row()
    if (!currentRow) return { text: " ", start: 0, width: 1 }
    const text = rowText(currentRow)
    const relative = Math.max(0, col() - copyMin(currentRow))
    const grapheme = displayCharAt(text, relative) ?? " "
    let start = 0
    for (const seg of segmenter.segment(text)) {
      const width = Bun.stringWidth(seg.segment === "\n" ? " " : seg.segment) || 1
      if (relative >= start && relative < start + width) {
        return { text: seg.segment, start, width }
      }
      start += width
    }
    return { text: grapheme, start: relative, width: Math.max(1, Bun.stringWidth(grapheme)) }
  })

  return {
    enter,
    exit,
    move,
    jump,
    clamp,
    setFromY,
    row,
    cursor,
    active,
    col,
  }
}
