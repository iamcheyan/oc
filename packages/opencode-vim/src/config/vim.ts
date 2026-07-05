import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

export type VimConfig = {
  hidePrompt?: boolean
  autoResume?: boolean
  autoAllowPermissions?: boolean
}

function stripJsonComments(json: string): string {
  let out = ""
  let inString = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < json.length; i++) {
    const char = json[i]
    const next = json[i + 1]

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false
        out += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      if (char === '"' && json[i - 1] !== "\\") {
        inString = false
      }
      out += char
      continue
    }

    if (char === '"') {
      inString = true
      out += char
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      i++
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      i++
      continue
    }

    out += char
  }

  return out.replace(/,\s*([\]}])/g, "$1")
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
  const configFile = findConfigFile(projectDir)
  if (!configFile) return {}
  try {
    const raw = readFileSync(configFile, "utf-8")
    const cleaned = stripJsonComments(raw)
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === "object" && "vim" in parsed && typeof parsed.vim === "object" && parsed.vim) {
      return { hidePrompt: parsed.vim.hidePrompt === true, autoResume: parsed.vim.autoResume === true, autoAllowPermissions: parsed.vim.autoAllowPermissions === true }
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
  }
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
}
