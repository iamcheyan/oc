import fs from "fs"
import path from "path"
import os from "os"
import { createInterface } from "readline/promises"

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")
const REGIONS = ["us-east-1", "ap-northeast-1"]
const DEFAULT_MODEL_PREFERENCE = "moonshotai.kimi-k2.5"

interface AwsProfile {
  name: string
  region?: string
}

interface BedrockModel {
  modelId: string
  modelName: string
  providerName: string
}

const S = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
}

function log(msg: string) {
  console.log(msg)
}

function logSuccess(msg: string) {
  console.log(`${S.green}\u2713${S.reset} ${msg}`)
}

function logWarn(msg: string) {
  console.log(`${S.yellow}\u26a0${S.reset} ${msg}`)
}

function logError(msg: string) {
  console.log(`${S.red}\u2717${S.reset} ${msg}`)
}

function readAwsConfig(): AwsProfile[] {
  const configPath = path.join(os.homedir(), ".aws", "config")
  let content: string
  try {
    content = fs.readFileSync(configPath, "utf-8")
  } catch {
    return []
  }

  const profiles: AwsProfile[] = []
  let current: AwsProfile | null = null

  for (const line of content.split("\n")) {
    const t = line.trim()
    const m = /^\[profile\s+(.+)\]$/.exec(t)
    if (m) {
      if (current) profiles.push(current)
      current = { name: m[1] }
      continue
    }
    if (current) {
      const rm = /^region\s*=\s*(.+)$/.exec(t)
      if (rm) current.region = rm[1]
    }
  }
  if (current) profiles.push(current)

  const credPath = path.join(os.homedir(), ".aws", "credentials")
  try {
    const credContent = fs.readFileSync(credPath, "utf-8")
    if (/^\[default\]/m.test(credContent)) {
      profiles.unshift({ name: "default" })
    }
  } catch {}

  return profiles
}

function listBedrockModels(profile: string, region: string): BedrockModel[] {
  log("Fetching model list from AWS Bedrock...")

  const result = Bun.spawnSync([
    "aws", "bedrock", "list-foundation-models",
    "--profile", profile,
    "--region", region,
  ])

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString()
    throw new Error(`Failed to list models: ${stderr}`)
  }

  const data = JSON.parse(result.stdout.toString())
  return (data.modelSummaries || []).map((m: any) => ({
    modelId: m.modelId,
    modelName: m.modelName || m.modelId,
    providerName: m.providerName,
  }))
}

function testBedrockModel(profile: string, region: string, modelId: string): boolean {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 10,
    messages: [{ role: "user", content: "Say hello" }],
  })
  const base64Body = Buffer.from(body).toString("base64")
  const outFile = path.join(os.tmpdir(), `bedrock-scan-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)

  const result = Bun.spawnSync([
    "aws", "bedrock-runtime", "invoke-model",
    "--profile", profile,
    "--region", region,
    "--model-id", modelId,
    "--body", base64Body,
    outFile,
  ], {
    timeout: 10000,
  })

  try { fs.rmSync(outFile, { force: true }) } catch {}

  return result.exitCode === 0
}

function buildModelOptions(models: BedrockModel[]): Array<{ label: string; value: string }> {
  return models.map((m) => {
    const label = m.modelName === m.modelId
      ? `amazon-bedrock/${m.modelId}`
      : `amazon-bedrock/${m.modelId} (${m.modelName})`
    return { label, value: `amazon-bedrock/${m.modelId}` }
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runBedrockScanner(): Promise<string | null> {
  console.log(`\n${S.bold}${S.blue}AWS Bedrock Model Scanner${S.reset}\n`)

  const profiles = readAwsConfig()
  if (profiles.length === 0) {
    logError("No AWS profiles found in ~/.aws/config")
    log("Please configure AWS CLI first: aws configure")
    return null
  }

  const defaultProfileIdx = profiles.findIndex((p) => p.name === "common-api-dev")
  const suggestIdx = defaultProfileIdx >= 0 ? defaultProfileIdx : 0

  log("Available AWS profiles:")
  for (let i = 0; i < profiles.length; i++) {
    const marker = i === suggestIdx ? ` ${S.green}(default)${S.reset}` : ""
    log(`  ${i + 1}. ${profiles[i].name}${marker}`)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const profileAnswer = await rl.question(`\nSelect profile [1-${profiles.length}] (default: ${suggestIdx + 1}): `)
  const profileIdx = (parseInt(profileAnswer) || suggestIdx + 1) - 1
  const selectedProfile = profiles[Math.max(0, Math.min(profileIdx, profiles.length - 1))]
  logSuccess(`Selected profile: ${selectedProfile.name}`)

  log("\nAvailable regions:")
  for (let i = 0; i < REGIONS.length; i++) {
    log(`  ${i + 1}. ${REGIONS[i]}`)
  }
  const regionAnswer = await rl.question(`Select region [1-${REGIONS.length}] (default: 1): `)
  const regionIdx = (parseInt(regionAnswer) || 1) - 1
  const selectedRegion = REGIONS[Math.max(0, Math.min(regionIdx, REGIONS.length - 1))]
  logSuccess(`Selected region: ${selectedRegion}`)

  let models: BedrockModel[]
  try {
    models = listBedrockModels(selectedProfile.name, selectedRegion)
  } catch (e: any) {
    logError(e.message)
    rl.close()
    return null
  }

  logSuccess(`Found ${models.length} models in ${selectedRegion}`)

  if (models.length === 0) {
    logWarn("No models found in this region")
    rl.close()
    return null
  }

  log(`\n${S.dim}Testing ${models.length} models one by one...${S.reset}`)

  const available: BedrockModel[] = []
  for (let i = 0; i < models.length; i++) {
    const model = models[i]
    process.stderr.write(`\r[${i + 1}/${models.length}] Testing ${model.modelId.slice(0, 60).padEnd(60)} `)

    const ok = testBedrockModel(selectedProfile.name, selectedRegion, model.modelId)

    if (ok) {
      available.push(model)
      process.stderr.write(`${S.green}\u2713${S.reset}\n`)
    } else {
      process.stderr.write(`${S.red}\u2717${S.reset}\n`)
    }

    await sleep(500)
  }

  if (available.length === 0) {
    logWarn("No models are accessible with current credentials")
    rl.close()
    return null
  }

  logSuccess(`Found ${available.length} available models`)

  const modelOptions = buildModelOptions(available)

  const preferredIdx = available.findIndex((m) => m.modelId === DEFAULT_MODEL_PREFERENCE)
  const defaultModelIdx = preferredIdx >= 0 ? preferredIdx + 1 : 1

  log(`\n${S.bold}Select Default Bedrock Model${S.reset}\n`)
  for (let i = 0; i < modelOptions.length; i++) {
    const marker = i === defaultModelIdx - 1 ? ` ${S.green}(default)${S.reset}` : ""
    log(`  ${i + 1}. ${modelOptions[i].label}${marker}`)
  }

  const modelAnswer = await rl.question(`\nSelect model [1-${modelOptions.length}] (default: ${defaultModelIdx}): `)
  const modelIdx = (parseInt(modelAnswer) || defaultModelIdx) - 1
  const selectedModel = modelOptions[Math.max(0, Math.min(modelIdx, modelOptions.length - 1))]
  rl.close()

  const modelId = selectedModel.value.replace("amazon-bedrock/", "")

  const modelsRecord: Record<string, { name: string }> = {}
  for (const m of available) {
    modelsRecord[m.modelId] = { name: m.modelName || m.modelId }
  }

  const config: Record<string, any> = {}
  try {
    const existing = await fs.promises.readFile(CONFIG_FILE, "utf-8")
    Object.assign(config, JSON.parse(existing))
  } catch {}

  config.model = selectedModel.value
  config.provider = config.provider || {}
  config.provider["amazon-bedrock"] = {
    options: { profile: selectedProfile.name, region: selectedRegion },
    models: modelsRecord,
  }

  await fs.promises.mkdir(CONFIG_DIR, { recursive: true })
  await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))

  console.log("")
  log(`${S.green}${S.bold}\u2713 Default model set to:${S.reset} ${S.bold}${selectedModel.value}${S.reset}`)
  log(`${S.dim}  Saved ${available.length} available models to ${CONFIG_FILE}${S.reset}`)
  log(`${S.dim}  Profile: ${selectedProfile.name}  Region: ${selectedRegion}${S.reset}`)
  console.log("")

  return selectedModel.value
}

if (import.meta.main) {
  runBedrockScanner().catch((e) => {
    logError(e.message)
    process.exit(1)
  })
}
