import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoutingAgentEntry {
  /** OpenCode agent name (e.g. "build", "scout", "engineer") */
  agent: string
  /** Model string in "provider/model" format */
  model?: string
}

export interface RoutingConfig {
  enabled: boolean
  agents: Record<string, RoutingAgentEntry>
}

// ── Agent definitions ─────────────────────────────────────────────────────────

export const ROUTING_AGENTS = [
  { key: "leader",   agent: "build",     label: "Leader",   description: "Main orchestrator, handles user conversation" },
  { key: "scout",    agent: "scout",     label: "Scout",    description: "Fast codebase exploration (read-only)" },
  { key: "engineer", agent: "engineer",  label: "Engineer", description: "General-purpose implementation worker" },
  { key: "critic",   agent: "critic",    label: "Critic",   description: "Independent code review and quality check" },
] as const

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_ROUTING: RoutingConfig = {
  enabled: false,
  agents: {
    leader:   { agent: "build" },
    scout:    { agent: "scout" },
    engineer: { agent: "engineer" },
    critic:   { agent: "critic" },
  },
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function cleanDir(projectDir: string): string {
  let dir = projectDir
  const colonIndex = dir.lastIndexOf(":")
  if (colonIndex > 1) {
    dir = dir.slice(0, colonIndex)
  }
  if (dir.startsWith("~")) {
    const homedir = process.env.HOME || process.env.USERPROFILE || ""
    dir = dir.replace("~", homedir)
  }
  return dir
}

const CONFIG_FILENAME = ".opencode/mina-routing.jsonc"

function getConfigPath(projectDir: string): string {
  return path.join(cleanDir(projectDir), CONFIG_FILENAME)
}

// ── JSONC strip (lightweight, no dependency) ──────────────────────────────────

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

// ── Load / Save ───────────────────────────────────────────────────────────────

/**
 * Load routing config from `.opencode/mina-routing.jsonc`.
 * Returns DEFAULT_ROUTING if file doesn't exist or parsing fails.
 */
export function loadRoutingConfig(projectDir: string): RoutingConfig {
  const configPath = getConfigPath(projectDir)
  if (!existsSync(configPath)) return structuredClone(DEFAULT_ROUTING)

  try {
    const raw = readFileSync(configPath, "utf-8")
    const cleaned = stripJsonComments(raw)
    const parsed = JSON.parse(cleaned)

    if (parsed && typeof parsed === "object" && parsed.routing && typeof parsed.routing === "object") {
      const r = parsed.routing
      return {
        enabled: r.enabled === true,
        agents: (r.agents && typeof r.agents === "object") ? r.agents : structuredClone(DEFAULT_ROUTING.agents),
      }
    }
  } catch {
    // parse failure → default
  }

  return structuredClone(DEFAULT_ROUTING)
}

/**
 * Save routing config to `.opencode/mina-routing.jsonc`.
 * Creates `.opencode/` directory if it doesn't exist.
 */
export function saveRoutingConfig(projectDir: string, config: RoutingConfig): void {
  const configPath = getConfigPath(projectDir)
  const configDir = path.dirname(configPath)

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  const agentLines = ROUTING_AGENTS.map((a) => {
    const entry = config.agents[a.key]
    const agentName = entry?.agent ?? a.agent
    const model = entry?.model ?? ""
    return `      "${a.key}": { "agent": "${agentName}", "model": "${model}" }`
  }).join(",\n")

  const content = `{
  "routing": {
    "enabled": ${config.enabled},
    "agents": {
${agentLines}
    }
  }
}
`
  writeFileSync(configPath, content, { encoding: "utf-8" })
}