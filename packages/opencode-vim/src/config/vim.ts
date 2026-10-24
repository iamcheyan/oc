import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { createSignal } from "solid-js"
import { stripJsonComments } from "../util/jsonc"

const [vimConfigVersion, setVimConfigVersion] = createSignal(0)

export type VimConfig = {
  hidePrompt?: boolean
  autoResume?: boolean
  autoAllowPermissions?: boolean
  enterFocusPrompt?: boolean
  pureMode?: boolean
  hideTools?: boolean
}

function findConfigFile(projectDir: string): string | null {
  const candidates = [
    path.join(projectDir, ".oc", "vim.jsonc"),
    path.join(projectDir, ".oc", "vim.json"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

export function loadVimConfig(projectDir: string): VimConfig {
  vimConfigVersion()
  const configFile = findConfigFile(projectDir)
  if (!configFile) return {}
  try {
    const raw = readFileSync(configFile, "utf-8")
    const cleaned = stripJsonComments(raw)
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === "object" && "vim" in parsed && typeof parsed.vim === "object" && parsed.vim) {
      return {
        hidePrompt: parsed.vim.hidePrompt === true,
        autoResume: parsed.vim.autoResume === true,
        autoAllowPermissions: parsed.vim.autoAllowPermissions === true,
        enterFocusPrompt: typeof parsed.vim.enterFocusPrompt === "boolean" ? parsed.vim.enterFocusPrompt : undefined,
        pureMode: parsed.vim.pureMode === true,
        hideTools: parsed.vim.hideTools === true,
      }
    }
  } catch {
    // ignore parse errors, fall back to defaults
  }
  return {}
}

export function saveVimConfig(projectDir: string, config: VimConfig): void {
  const dir = path.join(projectDir, ".oc")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, "vim.jsonc")
  const existing: Record<string, unknown> = {}
  try {
    const raw = readFileSync(filePath, "utf-8")
    const cleaned = stripJsonComments(raw)
    Object.assign(existing, JSON.parse(cleaned))
  } catch {
    // start fresh if file doesn't exist or is invalid
  }
  existing.vim = existing.vim ?? {}
  if (typeof existing.vim === "object" && existing.vim) {
    if (config.hidePrompt !== undefined) (existing.vim as Record<string, unknown>).hidePrompt = config.hidePrompt
    if (config.autoResume !== undefined) (existing.vim as Record<string, unknown>).autoResume = config.autoResume
    if (config.autoAllowPermissions !== undefined) (existing.vim as Record<string, unknown>).autoAllowPermissions = config.autoAllowPermissions
    if (config.enterFocusPrompt !== undefined) (existing.vim as Record<string, unknown>).enterFocusPrompt = config.enterFocusPrompt
    if (config.pureMode !== undefined) (existing.vim as Record<string, unknown>).pureMode = config.pureMode
    if (config.hideTools !== undefined) (existing.vim as Record<string, unknown>).hideTools = config.hideTools
  }
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
  setVimConfigVersion((v) => v + 1)
}
