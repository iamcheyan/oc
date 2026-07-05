import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { createSignal } from "solid-js"

export type QuickModelSlots = Record<string, string> // "1" -> "providerID/modelID"

export type QuickModelConfig = {
  slots: QuickModelSlots
}

const CONFIG_FILENAME = "quick-model.jsonc"

// Bumped whenever config is saved, so consumers can reactively re-read the file.
const [quickModelVersion, bumpQuickModelVersion] = createSignal(0)
export { quickModelVersion }

export const DEFAULT_QUICK_MODEL: QuickModelConfig = {
  slots: {},
}

function getGlobalConfigDir(): string {
  const configDir = process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode")
  return configDir
}

function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), CONFIG_FILENAME)
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

// Migrate local .oc/quick-model.jsonc to global ~/.config/opencode/quick-model.jsonc
function migrateLocalConfig(projectDir: string): QuickModelConfig {
  const localPath = path.join(cleanDir(projectDir), ".oc", CONFIG_FILENAME)
  if (!existsSync(localPath)) return { slots: {} }
  try {
    const raw = readFileSync(localPath, "utf-8")
    const cleaned = raw
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([\]}])/g, "$1")
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === "object" && parsed.quick_model && typeof parsed.quick_model.slots === "object") {
      const slots = parsed.quick_model.slots as Record<string, string>
      const clean: QuickModelSlots = {}
      for (const [k, v] of Object.entries(slots)) {
        if (typeof v === "string") clean[k] = v
      }
      // Write to global location
      const globalConfig = { slots: clean }
      saveQuickModelConfig(projectDir, globalConfig)
      // Delete local file to complete migration
      try { require("node:fs").unlinkSync(localPath) } catch {}
      return globalConfig
    }
  } catch {}
  return { slots: {} }
}

export function loadQuickModelConfig(_projectDir?: string): QuickModelConfig {
  const globalPath = getGlobalConfigPath()
  if (!existsSync(globalPath)) {
    // Try migrating from local config
    if (_projectDir) {
      const migrated = migrateLocalConfig(_projectDir)
      if (Object.keys(migrated.slots).length > 0) return migrated
    }
    return { slots: {} }
  }
  try {
    const raw = readFileSync(globalPath, "utf-8")
    const cleaned = raw
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,\s*([\]}])/g, "$1")
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === "object" && parsed.quick_model && typeof parsed.quick_model.slots === "object") {
      const slots = parsed.quick_model.slots as Record<string, string>
      const clean: QuickModelSlots = {}
      for (const [k, v] of Object.entries(slots)) {
        if (typeof v === "string") clean[k] = v
      }
      return { slots: clean }
    }
  } catch {}
  return { slots: {} }
}

export function saveQuickModelConfig(_projectDir?: string, config: QuickModelConfig = { slots: {} }): void {
  const globalPath = getGlobalConfigPath()
  const dir = path.dirname(globalPath)
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
  writeFileSync(globalPath, content, "utf-8")
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