import { readFileSync, existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import JSON5 from "json5"

export interface ProviderTestEntry {
  providerId: string
  name: string
  baseURL: string
  apiKey: string
  modelId: string
  modelName: string
  isGoogle?: boolean
  isOpenAI?: boolean
  email?: string
}

export interface ProviderTestResult {
  providerId: string
  name: string
  modelId: string
  modelName: string
  status: "idle" | "testing" | "success" | "error" | "skipped"
  latency?: number
  errorMessage?: string
  authStatus?: "idle" | "testing" | "success" | "error" | "skipped"
  authLatency?: number
  authError?: string
}

interface OpenCodeConfig {
  provider?: Record<string, {
    api?: string
    name?: string
    options?: {
      apiKey?: string
      baseURL?: string
      [key: string]: unknown
    }
    models?: Record<string, {
      id?: string
      name?: string
      [key: string]: unknown
    }>
    [key: string]: unknown
  }>
}

interface AntigravityAccount {
  email: string
  refreshToken: string
  projectId: string
  enabled: boolean
  cachedQuota?: Record<string, {
    remainingFraction: number
    resetTime: string
    modelCount: number
  }>
}

interface AntigravityConfig {
  version: number
  accounts: AntigravityAccount[]
  activeIndex: number
}

interface AuthEntry {
  type: string
  access?: string
  refresh?: string
  expires?: number
  accountId?: string
  key?: string
}

function resolveHomeDirectory(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir()
}

function resolveConfigPath(): string {
  const home = resolveHomeDirectory()
  const candidates = [
    path.join(home, ".config", "opencode", "opencode.jsonc"),
    path.join(home, ".config", "opencode", "opencode.json"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return path.join(home, ".config", "opencode", "opencode.jsonc")
}

function resolveAntigravityConfigPath(): string {
  return path.join(resolveHomeDirectory(), ".config", "opencode", "antigravity-accounts.json")
}

function resolveAuthConfigPath(): string {
  return path.join(resolveHomeDirectory(), ".local", "share", "opencode", "auth.json")
}

function parseJsoncFile<T>(filePath: string): T {
  const raw = readFileSync(filePath, "utf-8")
  return JSON5.parse(raw) as T
}

export function loadConfig(): OpenCodeConfig {
  const configPath = resolveConfigPath()
  if (!existsSync(configPath)) return {}
  return parseJsoncFile<OpenCodeConfig>(configPath)
}

function loadAntigravityConfig(): AntigravityConfig | null {
  const configPath = resolveAntigravityConfigPath()
  if (!existsSync(configPath)) return null
  try {
    const raw = readFileSync(configPath, "utf-8")
    return JSON.parse(raw) as AntigravityConfig
  } catch {
    return null
  }
}

function loadAuthConfig(): Record<string, AuthEntry> | null {
  const configPath = resolveAuthConfigPath()
  if (!existsSync(configPath)) return null
  try {
    const raw = readFileSync(configPath, "utf-8")
    return JSON.parse(raw) as Record<string, AuthEntry>
  } catch {
    return null
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const payload = Buffer.from(parts[1], "base64url").toString()
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}

export function getTestableProviders(config: OpenCodeConfig): ProviderTestEntry[] {
  const providers = config.provider ?? {}
  const result: ProviderTestEntry[] = []

  for (const [providerId, providerConfig] of Object.entries(providers)) {
    if (providerId === "google") continue // Handle Google separately

    if (!providerConfig.options?.baseURL || !providerConfig.options?.apiKey) continue

    const models = providerConfig.models ?? {}
    const firstModelEntry = Object.entries(models)[0]
    if (!firstModelEntry) continue

    const [modelKey, modelConfig] = firstModelEntry
    const modelId = modelConfig.id ?? modelKey
    const modelName = modelConfig.name ?? modelId

    result.push({
      providerId,
      name: providerConfig.name ?? providerId,
      baseURL: providerConfig.options.baseURL,
      apiKey: providerConfig.options.apiKey,
      modelId,
      modelName,
    })
  }

  // Add Google accounts from antigravity config
  const antigravityConfig = loadAntigravityConfig()
  if (antigravityConfig) {
    for (const account of antigravityConfig.accounts) {
      if (!account.enabled) continue

      const quota = account.cachedQuota
      const geminiFlashQuota = quota?.["gemini-flash"]
      const geminiProQuota = quota?.["gemini-pro"]

      const modelId = "gemini-3.1-pro"
      const modelName = "Gemini 3.1 Pro"
      const remainingFraction = geminiProQuota?.remainingFraction ?? geminiFlashQuota?.remainingFraction ?? 0
      const resetTime = geminiProQuota?.resetTime ?? geminiFlashQuota?.resetTime ?? ""

      const emailUsername = account.email.split("@")[0]

      result.push({
        providerId: `google-${account.projectId}`,
        name: `google:${emailUsername}`,
        baseURL: "",
        apiKey: "",
        modelId,
        modelName,
        isGoogle: true,
        email: account.email,
      })
    }
  }

  // Add OpenAI accounts from auth.json
  const authConfig = loadAuthConfig()
  if (authConfig) {
    // Only process openai and codex entries (skip lmstudio, google, etc.)
    const openaiProviderIds = ["openai", "codex"]

    for (const providerId of openaiProviderIds) {
      const authEntry = authConfig[providerId]
      if (!authEntry || authEntry.type !== "oauth" || !authEntry.access) continue

      // Parse JWT to get email and plan info
      const payload = parseJwtPayload(authEntry.access)
      const authClaim = (payload?.["https://api.openai.com/auth"] as Record<string, unknown>) || {}
      const profileClaim = (payload?.["https://api.openai.com/profile"] as Record<string, unknown>) || {}

      const email = profileClaim.email as string || ""
      const emailUsername = email ? email.split("@")[0] : providerId

      // Get plan type from JWT claims
      const planType = authClaim.chatgpt_plan_type as string || "unknown"

      result.push({
        providerId,
        name: providerId === "openai" ? `chatgpt:${emailUsername}` : `codex:${emailUsername}`,
        baseURL: "",
        apiKey: "",
        modelId: planType === "plus" ? "gpt-5.4" : "gpt-5.4-mini",
        modelName: planType === "plus" ? "GPT-5.4 (Plus)" : "GPT-5.4 Mini",
        isOpenAI: true,
        email: email,
      })
    }
  }

  return result
}

export async function testProvider(
  entry: ProviderTestEntry,
  signal?: AbortSignal
): Promise<{ success: boolean; latency: number; errorMessage?: string }> {
  // For Google accounts, skip the API test since they use antigravity auth
  if (entry.isGoogle) {
    return { success: true, latency: 0 }
  }

  // For OpenAI accounts, skip the API test since they use OAuth
  if (entry.isOpenAI) {
    return { success: true, latency: 0 }
  }

  const url = entry.baseURL.replace(/\/+$/, "") + "/chat/completions"
  const body = JSON.stringify({
    model: entry.modelId,
    messages: [{ role: "user", content: "Say 1" }],
    max_tokens: 1,
    stream: false,
  })
  const start = performance.now()

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${entry.apiKey}`,
      },
      body,
      signal,
    })
    const latency = Math.round(performance.now() - start)

    if (response.ok) return { success: true, latency }

    let errorText = ""
    try {
      const errorBody = await response.json() as { error?: { message?: string } }
      errorText = errorBody?.error?.message ?? ""
    } catch {
      errorText = response.statusText
    }

    const lower = errorText.toLowerCase()
    if (lower.includes("insufficient") || lower.includes("quota") || lower.includes("suspended") || lower.includes("balance")) {
      return { success: false, latency, errorMessage: `Suspended: ${errorText}` }
    }
    if (lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("auth") || lower.includes("key")) {
      return { success: false, latency, errorMessage: `Auth Error: ${errorText}` }
    }
    return { success: false, latency, errorMessage: `HTTP ${response.status}: ${errorText || response.statusText}` }
  } catch (e: unknown) {
    const latency = Math.round(performance.now() - start)
    if (e instanceof DOMException && e.name === "AbortError") {
      return { success: false, latency, errorMessage: "Timeout (>10s)" }
    }
    const errMsg = e instanceof Error ? e.message : String(e)
    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("connect") || errMsg.includes("dns")) {
      return { success: false, latency, errorMessage: `Network Error: ${errMsg}` }
    }
    return { success: false, latency, errorMessage: errMsg }
  }
}

export async function testAuth(
  entry: ProviderTestEntry,
  signal?: AbortSignal
): Promise<{ success: boolean; latency: number; errorMessage?: string }> {
  // For Google accounts, test the antigravity auth by checking cached quota
  if (entry.isGoogle) {
    const antigravityConfig = loadAntigravityConfig()
    if (!antigravityConfig) {
      return { success: false, latency: 0, errorMessage: "No antigravity config" }
    }

    const account = antigravityConfig.accounts.find(a => a.email === entry.email)
    if (!account) {
      return { success: false, latency: 0, errorMessage: "Account not found" }
    }

    if (!account.enabled) {
      return { success: false, latency: 0, errorMessage: "Account disabled" }
    }

    const quota = account.cachedQuota
    const geminiProQuota = quota?.["gemini-pro"]
    const remainingFraction = geminiProQuota?.remainingFraction ?? 0

    if (remainingFraction <= 0) {
      return { success: false, latency: 0, errorMessage: "No quota remaining" }
    }

    return { success: true, latency: 0 }
  }

  // For OpenAI accounts, check if token is valid and not expired
  if (entry.isOpenAI) {
    const authConfig = loadAuthConfig()
    if (!authConfig) {
      return { success: false, latency: 0, errorMessage: "No auth config" }
    }

    const authEntry = authConfig[entry.providerId]
    if (!authEntry) {
      return { success: false, latency: 0, errorMessage: "Account not found" }
    }

    if (!authEntry.access) {
      return { success: false, latency: 0, errorMessage: "No access token" }
    }

    // Check if token is expired
    if (authEntry.expires && authEntry.expires < Date.now()) {
      return { success: false, latency: 0, errorMessage: "Token expired" }
    }

    return { success: true, latency: 0 }
  }

  const url = entry.baseURL.replace(/\/+$/, "") + "/models"
  const start = performance.now()

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${entry.apiKey}`,
      },
      signal,
    })
    const latency = Math.round(performance.now() - start)

    if (response.ok) return { success: true, latency }

    let errorText = ""
    try {
      const errorBody = await response.json() as { error?: { message?: string } }
      errorText = errorBody?.error?.message ?? ""
    } catch {
      errorText = response.statusText
    }

    const lower = errorText.toLowerCase()
    if (lower.includes("insufficient") || lower.includes("quota") || lower.includes("suspended") || lower.includes("balance")) {
      return { success: false, latency, errorMessage: `Quota: ${errorText}` }
    }
    if (lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("auth") || lower.includes("key")) {
      return { success: false, latency, errorMessage: `Auth: ${errorText}` }
    }
    return { success: false, latency, errorMessage: `HTTP ${response.status}: ${errorText || response.statusText}` }
  } catch (e: unknown) {
    const latency = Math.round(performance.now() - start)
    if (e instanceof DOMException && e.name === "AbortError") {
      return { success: false, latency, errorMessage: "Timeout (>10s)" }
    }
    const errMsg = e instanceof Error ? e.message : String(e)
    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("connect") || errMsg.includes("dns")) {
      return { success: false, latency, errorMessage: `Network: ${errMsg}` }
    }
    return { success: false, latency, errorMessage: errMsg }
  }
}
