import {
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type CliRenderer,
  type SelectOption,
  t,
  bold,
  fg,
} from "@opentui/core"
import type { OptimizedBuffer } from "@opentui/core"
import { parseColor } from "@opentui/core"
import {
  loadConfig,
  getTestableProviders,
  testProvider,
  testAuth,
  type ProviderTestEntry,
  type ProviderTestResult,
} from "./api-test"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"

// Colors
export const P = {
  bg: "#0a0e17",
  panel: "#0f1729",
  border: "#1e293b",
  borderActive: "#3b82f6",
  text: "#e2e8f0",
  muted: "#64748b",
  dim: "#475569",
  cyan: "#22d3ee",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  highlight: "#1a1f2e",
  highlightBg: "#0f1729",
}

// Custom SelectRenderable with per-item color support
interface ColoredSelectOption extends SelectOption {
  itemColor?: string
}

export class ColoredSelectRenderable extends SelectRenderable {
  private _itemColors: Map<number, string> = new Map()

  setItemColor(index: number, color: string) {
    this._itemColors.set(index, color)
  }

  clearItemColors() {
    this._itemColors.clear()
  }
}

// Cache
const CACHE_FILE = path.join(os.homedir(), ".cache", "api-test-cache.json")

interface CacheEntry {
  providerId: string
  modelId: string
  apiStatus: "success" | "error"
  authStatus: "success" | "error"
  timestamp: number
}

function loadCache(): CacheEntry[] {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = readFileSync(CACHE_FILE, "utf-8")
      return JSON.parse(data)
    }
  } catch {}
  return []
}

function saveCache(entries: CacheEntry[]) {
  try {
    const dir = path.dirname(CACHE_FILE)
    if (!existsSync(dir)) {
      const { mkdirSync } = require("node:fs")
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 2))
  } catch {}
}

// Column Width Calculation
export interface ColumnWidths {
  provider: number
  api: number
  apiLatency: number
  auth: number
  authLatency: number
  model: number
}

function getColumnWidths(renderer: CliRenderer): ColumnWidths {
  const termWidth = renderer ? renderer.terminalWidth : 100
  return getColumnWidthsByTerminalWidth(termWidth)
}

export function getColumnWidthsByTerminalWidth(termWidth: number): ColumnWidths {
  const avail = Math.max(40, termWidth - 8)

  const provider = Math.floor(avail * 0.22)
  const api = Math.floor(avail * 0.18)
  const apiLatency = Math.floor(avail * 0.12)
  const auth = Math.floor(avail * 0.18)
  const authLatency = Math.floor(avail * 0.12)
  const model = avail - (provider + api + apiLatency + auth + authLatency)

  return { provider, api, apiLatency, auth, authLatency, model }
}

export function formatRow(
  provider: string,
  api: string,
  apiLatency: string,
  auth: string,
  authLatency: string,
  model: string,
  widths: ColumnWidths
): string {
  const p = provider.padEnd(widths.provider).slice(0, widths.provider)
  const a = api.padEnd(widths.api).slice(0, widths.api)
  const al = apiLatency.padEnd(widths.apiLatency).slice(0, widths.apiLatency)
  const au = auth.padEnd(widths.auth).slice(0, widths.auth)
  const aul = authLatency.padEnd(widths.authLatency).slice(0, widths.authLatency)
  const m = model.padEnd(widths.model).slice(0, widths.model)

  return `${p}  ${a}  ${al}  ${au}  ${aul}  ${m}`
}

function getItemColor(r: ProviderTestResult): string {
  if (r.status === "success" && r.authStatus === "success") return P.green
  return P.text
}

function resultToOption(r: ProviderTestResult, widths: ColumnWidths): ColoredSelectOption {
  const apiIcon = r.status === "success" ? "✓"
    : r.status === "error" ? "✗"
    : r.status === "testing" ? "⏳"
    : "○"

  const authIcon = r.authStatus === "success" ? "✓"
    : r.authStatus === "error" ? "✗"
    : r.authStatus === "testing" ? "⏳"
    : "○"

  const apiLabel = r.status === "success" ? "Connected"
    : r.status === "error" ? (r.errorMessage ?? "Error")
    : r.status === "testing" ? "Testing…"
    : "Pending"

  const authLabel = r.authStatus === "success" ? "Valid"
    : r.authStatus === "error" ? (r.authError ?? "Error")
    : r.authStatus === "testing" ? "Testing…"
    : "Pending"

  const latency = r.latency != null ? `${r.latency}ms` : r.status === "testing" ? "Testing…" : "—"
  const authLatency = r.authLatency != null ? `${r.authLatency}ms` : r.authStatus === "testing" ? "Testing…" : "—"

  const name = r.name
  const model = r.modelId

  const formatted = formatRow(
    `${apiIcon} ${name}`,
    `${apiIcon} ${apiLabel}`,
    latency,
    `${authIcon} ${authLabel}`,
    authLatency,
    model,
    widths
  )

  return {
    name: formatted,
    description: "",
    value: r.providerId,
    itemColor: getItemColor(r),
  }
}

// TestUI interface
export interface TestUI {
  root: BoxRenderable
  destroy(): void
  handleKeyPress(key: { name: string; shift?: boolean; ctrl?: boolean }): boolean
  refresh(): void
  getSelectedIndex(): number
  getProviders(): ProviderTestEntry[]
  getResults(): ProviderTestResult[]
}

// Create TestUI
export function createTestUI(renderer: CliRenderer): TestUI {
  let providers: ProviderTestEntry[] = []
  let results: ProviderTestResult[] = []
  let isTesting = false

  // Load data
  const config = loadConfig()
  providers = getTestableProviders(config)
  results = providers.map((p) => ({
    providerId: p.providerId,
    name: p.name,
    modelId: p.modelId,
    modelName: p.modelName,
    status: "idle" as const,
    authStatus: "idle" as const,
  }))

  // Load cache
  const cache = loadCache()
  for (const entry of cache) {
    const idx = results.findIndex(r => r.providerId === entry.providerId && r.modelId === entry.modelId)
    if (idx >= 0) {
      results[idx] = {
        ...results[idx],
        status: entry.apiStatus,
        authStatus: entry.authStatus,
      }
    }
  }

  // Create UI elements
  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    backgroundColor: P.bg,
    width: "100%",
    height: "100%",
  })

  // Title
  const title = new TextRenderable(renderer, {
    content: t`${fg(P.cyan)(bold(" 󰄲  Provider Connectivity Test "))}`,
    width: "100%",
  })
  root.add(title)

  // Header row
  const headerRow = new BoxRenderable(renderer, {
    id: "header",
    flexDirection: "row",
    width: "100%",
    height: 1,
  })
  const headerText = new TextRenderable(renderer, {
    content: "",
    width: "100%",
  })
  headerRow.add(headerText)
  root.add(headerRow)

  // Separator
  const sep = new TextRenderable(renderer, {
    content: "",
    width: "100%",
  })
  root.add(sep)

  // Select list
  const selectElement = new ColoredSelectRenderable(renderer, {
    id: "provider-select",
    width: "100%",
    height: Math.min(results.length + 2, 15),
    showDescription: false,
    showScrollIndicator: true,
    itemSpacing: 0,
    wrapSelection: true,
    backgroundColor: "transparent",
    focusedBackgroundColor: P.highlight,
    textColor: P.text,
    focusedTextColor: P.text,
    selectedBackgroundColor: "transparent",
    selectedTextColor: P.cyan,
    descriptionColor: P.muted,
    selectedDescriptionColor: P.muted,
    renderAfter: function (this: any, buffer: OptimizedBuffer) {
      const scrollOffset = this.scrollOffset || 0
      const maxVisibleItems = this.maxVisibleItems || 0
      const linesPerItem = this.linesPerItem || 1
      const selectedIndex = this._selectedIndex || 0
      const options = this._options || []

      if (options.length === 0) return

      const visibleOptions = options.slice(scrollOffset, scrollOffset + maxVisibleItems)

      for (let i = 0; i < visibleOptions.length; i++) {
        const actualIndex = scrollOffset + i
        const option = visibleOptions[i] as ColoredSelectOption
        const isSelected = actualIndex === selectedIndex
        const itemY = i * linesPerItem

        if (!isSelected && option.itemColor && option.itemColor !== P.text) {
          const color = parseColor(option.itemColor)
          const indicator = "  "
          const text = `${indicator}${option.name}`

          buffer.fillRect(0, itemY, this.width, linesPerItem, parseColor("transparent"))
          buffer.drawText(text, 1, itemY, color)
        }
      }
    },
  })
  root.add(selectElement)

  // Detail panel
  const detailDisplay = new TextRenderable(renderer, {
    content: "",
    width: "100%",
    height: 7,
  })
  root.add(detailDisplay)

  // Footer
  const footerDisplay = new TextRenderable(renderer, {
    content: "",
    width: "100%",
  })
  root.add(footerDisplay)

  // Helper functions
  function getColumnWidthsLocal(): ColumnWidths {
    return getColumnWidths(renderer)
  }

  function updateDetail() {
    const idx = selectElement.getSelectedIndex()
    const r = results[idx]
    const p = providers[idx]
    if (!r || !p) {
      detailDisplay.content = ""
      return
    }

    const apiStatus = r.status === "success" ? fg(P.green)("✓ Connected")
      : r.status === "error" ? fg(P.red)(`✗ ${r.errorMessage ?? "Error"}`)
      : r.status === "testing" ? fg(P.amber)("⏳ Testing…")
      : fg(P.dim)("○ Pending")

    const authStatus = r.authStatus === "success" ? fg(P.green)("✓ Valid")
      : r.authStatus === "error" ? fg(P.red)(`✗ ${r.authError ?? "Error"}`)
      : r.authStatus === "testing" ? fg(P.amber)("⏳ Testing…")
      : fg(P.dim)("○ Pending")

    const latency = r.latency != null ? `${r.latency}ms` : "—"
    const authLatency = r.authLatency != null ? `${r.authLatency}ms` : "—"

    const maskedKey = "••••" + p.apiKey.slice(-4)

    detailDisplay.content = t`${fg(P.cyan)(bold("▸ "))}${fg(P.text)(bold(r.providerId))}  ${fg(P.muted)(r.name)}
${fg(P.dim)("  Model:  ")}${fg(P.text)(r.modelId)}
${fg(P.dim)("  URL:    ")}${fg(P.muted)(p.baseURL.length > 70 ? p.baseURL.slice(0, 69) + "…" : p.baseURL)}
${fg(P.dim)("  Key:    ")}${fg(P.dim)(maskedKey)}
${fg(P.dim)("  API:    ")}${apiStatus}  ${fg(P.dim)(`(${latency})`)}
${fg(P.dim)("  Auth:   ")}${authStatus}  ${fg(P.dim)(`(${authLatency})`)}`
  }

  function updateFooter() {
    footerDisplay.content = t`${fg(P.cyan)(bold("↑↓"))}${fg(P.dim)(" navigate  ")}${fg(P.cyan)(bold("Enter"))}${fg(P.dim)(" test  ")}${fg(P.cyan)(bold("t"))}${fg(P.dim)(" test all  ")}${fg(P.cyan)(bold("r"))}${fg(P.dim)(" re-test  ")}${fg(P.cyan)(bold("q"))}${fg(P.dim)(" close")}`
  }

  function refreshSelect() {
    const widths = getColumnWidthsLocal()
    const opts = results.map((r, i) => {
      const option = resultToOption(r, widths)
      selectElement.setItemColor(i, getItemColor(r))
      return option
    })
    selectElement.options = opts
    updateDetail()
  }

  function updateHeaderAndSeparator() {
    const widths = getColumnWidthsLocal()
    const termWidth = renderer.terminalWidth
    const contentWidth = termWidth - 4

    headerText.content = t`${fg(P.dim)("  " + formatRow("Provider", "API Status", "Latency", "Auth Status", "Latency", "Model", widths))}`
    sep.content = t`${fg(P.border)("  " + "─".repeat(contentWidth - 2))}`
  }

  function saveResultsToCache() {
    const entries: CacheEntry[] = results.map(r => ({
      providerId: r.providerId,
      modelId: r.modelId,
      apiStatus: r.status === "success" ? "success" : "error",
      authStatus: r.authStatus === "success" ? "success" : "error",
      timestamp: Date.now(),
    }))
    saveCache(entries)
  }

  async function runTests() {
    if (isTesting) return
    isTesting = true

    results = providers.map((p) => ({
      providerId: p.providerId,
      name: p.name,
      modelId: p.modelId,
      modelName: p.modelName,
      status: "testing" as const,
      authStatus: "idle" as const,
    }))
    refreshSelect()

    for (let i = 0; i < providers.length; i++) {
      const p = providers[i]

      const apiRes = await testProvider(p)
      results[i] = {
        ...results[i],
        status: apiRes.success ? "success" : "error",
        latency: apiRes.latency,
        errorMessage: apiRes.errorMessage,
        authStatus: "testing",
      }
      refreshSelect()

      const authRes = await testAuth(p)
      results[i] = {
        ...results[i],
        authStatus: authRes.success ? "success" : "error",
        authLatency: authRes.latency,
        authError: authRes.errorMessage,
      }
      refreshSelect()
    }

    saveResultsToCache()
    isTesting = false
  }

  async function runSingleTest(index: number) {
    if (index < 0 || index >= providers.length) return
    const p = providers[index]

    results[index] = { ...results[index], status: "testing", authStatus: "idle" }
    refreshSelect()

    const apiRes = await testProvider(p)
    results[index] = {
      ...results[index],
      status: apiRes.success ? "success" : "error",
      latency: apiRes.latency,
      errorMessage: apiRes.errorMessage,
      authStatus: "testing",
    }
    refreshSelect()

    const authRes = await testAuth(p)
    results[index] = {
      ...results[index],
      authStatus: authRes.success ? "success" : "error",
      authLatency: authRes.latency,
      authError: authRes.errorMessage,
    }
    refreshSelect()

    saveResultsToCache()
  }

  // Event handlers
  selectElement.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    updateDetail()
  })

  selectElement.on(SelectRenderableEvents.ITEM_SELECTED, (idx: number) => {
    if (!isTesting) {
      runSingleTest(idx)
    }
  })

  // Initial render
  updateHeaderAndSeparator()
  refreshSelect()
  updateFooter()
  selectElement.focus()

  // Handle resize
  renderer.on("resize", () => {
    updateHeaderAndSeparator()
    refreshSelect()
  })

  // Return interface
  return {
    root,
    destroy() {
      // Cleanup if needed
    },
    handleKeyPress(key) {
      if (key.name === "t" && !isTesting) {
        runTests()
        return true
      }
      if (key.name === "r" && !isTesting) {
        runTests()
        return true
      }
      if (key.name === "return" && !isTesting) {
        const idx = selectElement.getSelectedIndex()
        runSingleTest(idx)
        return true
      }
      return false
    },
    refresh() {
      refreshSelect()
    },
    getSelectedIndex() {
      return selectElement.getSelectedIndex()
    },
    getProviders() {
      return providers
    },
    getResults() {
      return results
    },
  }
}
