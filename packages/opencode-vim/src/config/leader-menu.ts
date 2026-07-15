import { readFileSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"
import { stripJsonComments } from "@/util/jsonc"

export type LeaderAction =
  | "tui"
  | "command"
  | "shell"
  | "quit"
  | "clear"
  | "backup"
  | "restore"
  | "api_test"
  | "lazygit"
  | "lazyvim"
  | "skill"

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
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return false
  if (binaryExistsCache.has(name)) {
    return binaryExistsCache.get(name)!
  }
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" })
    binaryExistsCache.set(name, true)
    return true
  } catch {
    binaryExistsCache.set(name, false)
    return false
  }
}
