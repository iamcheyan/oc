import { readFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"

export type LeaderAction = "tui" | "command" | "shell" | "quit" | "clear" | "backup" | "restore" | "api_test" | "lazygit" | "lazyvim" | "skill" | "routing"

export type LeaderItemConfig =
  | {
      key: string
      label: string
      icon?: string
      action: LeaderAction
      command?: string
      args?: string[]
      require?: string // binary name that must exist in PATH for this item to show
      skill?: string // skill name to trigger (for "skill" action)
    }
  | { key: "—" | "---"; label: string; separator: true }

export type LeaderGroupConfig = {
  key: string
  label: string
  icon?: string
  items: LeaderItemConfig[]
}

export type LeaderMenuConfig = {
  leader: {
    groups: LeaderGroupConfig[]
  }
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
        i++ // skip "/"
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
    path.join(projectDir, ".oc", "leader.jsonc"),
    path.join(projectDir, ".oc", "leader.json"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

export function loadLeaderMenuConfig(projectDir: string): LeaderGroupConfig[] | null {
  const configFile = findConfigFile(projectDir)
  if (!configFile) return null

  try {
    const raw = readFileSync(configFile, "utf-8")
    const cleaned = stripJsonComments(raw)
    const parsed = JSON.parse(cleaned) as LeaderMenuConfig
    if (parsed.leader?.groups && Array.isArray(parsed.leader.groups)) {
      return parsed.leader.groups
    }
  } catch {
    // ignore parse errors, fall back to defaults
  }
  return null
}

const binaryExistsCache = new Map<string, boolean>()

export function binaryExists(name: string): boolean {
  if (binaryExistsCache.has(name)) {
    return binaryExistsCache.get(name)!
  }
  try {
    execSync(`which ${name}`, { stdio: "ignore" })
    binaryExistsCache.set(name, true)
    return true
  } catch {
    binaryExistsCache.set(name, false)
    return false
  }
}
