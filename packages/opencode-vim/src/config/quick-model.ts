import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { createSignal } from "solid-js"

export type QuickModelSlots = Record<string, string> // "1" -> "providerID/modelID"

export type QuickModelConfig = {
  slots: QuickModelSlots
}

const CONFIG_FILENAME = ".oc/quick-model.jsonc"

// Bumped whenever config is saved, so consumers can reactively re-read the file.
const [quickModelVersion, bumpQuickModelVersion] = createSignal(0)
export { quickModelVersion }

export const DEFAULT_QUICK_MODEL: QuickModelConfig = {
  slots: {},
}

function cleanDir(projectDir: string): string {
  let dir = projectDir
  // Strip trailing ":line:col" suffix that some directory accessors append
  const colonIndex = dir.lastIndexOf(":")
  if (colonIndex > 1) dir = dir.slice(0, colonIndex)
  if (dir.startsWith("~")) {
    const home = process.env.HOME || process.env.USERPROFILE || ""
    dir = dir.replace("~", home)
  }
  return dir
}

function configPath(projectDir: string): string {
  return path.join(cleanDir(projectDir), CONFIG_FILENAME)
}

export function loadQuickModelConfig(projectDir: string): QuickModelConfig {
  const fp = configPath(projectDir)
  if (!existsSync(fp)) return { slots: {} }
  try {
    const raw = readFileSync(fp, "utf-8")
    const cleaned = raw
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([\]}])/g, "$1")
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === "object" && parsed.quick_model && typeof parsed.quick_model.slots === "object") {
      const slots = parsed.quick_model.slots as Record<string, string>
      // Normalize: only keep string values
      const clean: QuickModelSlots = {}
      for (const [k, v] of Object.entries(slots)) {
        if (typeof v === "string") clean[k] = v
      }
      return { slots: clean }
    }
  } catch { /* fall through */ }
  return { slots: {} }
}

export function saveQuickModelConfig(projectDir: string, config: QuickModelConfig): void {
  const fp = configPath(projectDir)
  const dir = path.dirname(fp)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Build slots JSON entries, filtering out empty values
  const slotEntries = Object.entries(config.slots)
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
  const slotLines = slotEntries.map(([k, v]) => `      "${k}": "${v}"`)
  const slotsBlock = slotLines.length > 0
    ? `{\n${slotLines.join(",\n")}\n    }`
    : `{}`
  const content = `{
  "quick_model": {
    "slots": ${slotsBlock}
  }
}
`
  writeFileSync(fp, content, "utf-8")
  bumpQuickModelVersion((v) => v + 1)
}

export function getSlotModel(cfg: QuickModelConfig, slot: string): { providerID: string; modelID: string } | null {
  const val = cfg.slots[slot]
  if (!val) return null
  const idx = val.indexOf("/")
  if (idx === -1) return null
  return { providerID: val.slice(0, idx), modelID: val.slice(idx + 1) }
}

export function formatSlotModel(modelStr: string): string {
  const idx = modelStr.indexOf("/")
  return idx === -1 ? modelStr : modelStr.slice(idx + 1)
}