import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

export type VimConfig = {
  hidePrompt?: boolean
  autoResume?: boolean
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
      return { hidePrompt: parsed.vim.hidePrompt === true, autoResume: parsed.vim.autoResume === true }
    }
  } catch {
    // ignore parse errors, fall back to defaults
  }
  return {}
}
