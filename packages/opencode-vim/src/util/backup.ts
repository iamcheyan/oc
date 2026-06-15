import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import os from "node:os"

export interface BackupResult {
  success: boolean
  mergedFiles: string[]
  destFile?: string
  error?: string
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

function deepMerge(target: any, source: any): any {
  if (typeof target !== "object" || target === null) return source
  if (typeof source !== "object" || source === null) return target

  const result = { ...target }
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = result[key]

    if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      result[key] = Array.from(new Set([...targetValue, ...sourceValue]))
    } else if (
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      typeof targetValue === "object" &&
      targetValue !== null
    ) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else {
      result[key] = sourceValue
    }
  }
  return result
}

function maskApiKeyString(val: string): string {
  if (!val) return val
  const trimmed = val.trim()
  if (trimmed.startsWith("{env:") || trimmed.startsWith("${")) {
    return val
  }
  
  if (trimmed.length > 16) {
    const prefix = trimmed.slice(0, 9)
    const suffix = trimmed.slice(-6)
    return `${prefix}${"*".repeat(36)}${suffix}`
  } else if (trimmed.length > 6) {
    const prefix = trimmed.slice(0, 2)
    const suffix = trimmed.slice(-2)
    return `${prefix}${"*".repeat(12)}${suffix}`
  } else {
    return "*".repeat(8)
  }
}

function maskSensitivePropertiesRecursive(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(maskSensitivePropertiesRecursive)
  }

  const result: any = {}
  const sensitiveRegex = /api_?key|secret|token|password/i
  const rawKeyRegex = /^(tp|sk)-[a-zA-Z0-9]{20,}$/

  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === "string" && (sensitiveRegex.test(key) || rawKeyRegex.test(value.trim()))) {
      result[key] = maskApiKeyString(value)
    } else {
      result[key] = maskSensitivePropertiesRecursive(value)
    }
  }

  return result
}

export function performConfigBackup(projectDir: string): BackupResult {
  let cleanDir = projectDir.trim()
  const colonIndex = cleanDir.lastIndexOf(":")
  if (colonIndex > 1) {
    cleanDir = cleanDir.slice(0, colonIndex)
  }
  if (cleanDir.startsWith("~")) {
    const homedir = os.homedir()
    cleanDir = cleanDir.replace("~", homedir)
  }

  try {
    const globalFolders = [
      path.join(os.homedir(), ".opencode"),
      path.join(os.homedir(), ".config", "opencode"),
    ]
    if (process.env.OPENCODE_CONFIG_DIR) {
      globalFolders.push(process.env.OPENCODE_CONFIG_DIR)
    }

    const localFolders: string[] = []
    let curr = cleanDir
    while (curr) {
      const localOpencode = path.join(curr, ".opencode")
      localFolders.push(localOpencode)
      const parent = path.dirname(curr)
      if (parent === curr) break
      curr = parent
    }
    localFolders.reverse()

    const searchFolders = [...globalFolders, ...localFolders]
    const candidates = [
      "config.json",
      "config.jsonc",
      "opencode.json",
      "opencode.jsonc",
      "tui.json",
      "tui.jsonc",
    ]

    let mergedConfig: any = {}
    const mergedFiles: string[] = []

    for (const folder of searchFolders) {
      if (!existsSync(folder)) continue
      for (const file of candidates) {
        const fullPath = path.join(folder, file)
        if (existsSync(fullPath)) {
          try {
            const raw = readFileSync(fullPath, "utf-8")
            const cleaned = stripJsonComments(raw)
            if (cleaned.trim()) {
              const parsed = JSON.parse(cleaned)
              mergedConfig = deepMerge(mergedConfig, parsed)
              mergedFiles.push(fullPath)
            }
          } catch {
            // ignore malformed config files
          }
        }
      }
    }

    if (mergedFiles.length === 0) {
      return {
        success: false,
        mergedFiles: [],
        error: "No opencode config files found to merge.",
      }
    }

    const maskedConfig = maskSensitivePropertiesRecursive(mergedConfig)

    const ocDir = path.join(cleanDir, ".oc")
    if (!existsSync(ocDir)) {
      mkdirSync(ocDir, { recursive: true })
    }

    const destFile = path.join(ocDir, "config_backup.json")
    writeFileSync(destFile, JSON.stringify(maskedConfig, null, 2), "utf-8")

    return {
      success: true,
      mergedFiles,
      destFile,
    }
  } catch (e: any) {
    return {
      success: false,
      mergedFiles: [],
      error: e?.message || String(e),
    }
  }
}

function getAllFilesRecursive(dir: string, baseDir: string = dir): { relativePath: string; absolutePath: string }[] {
  let files: { relativePath: string; absolutePath: string }[] = []
  if (!existsSync(dir)) return files

  const list = readdirSync(dir)
  for (const item of list) {
    if (item === "node_modules" || item === ".git" || item === "antigravity-logs") continue
    
    const fullPath = path.join(dir, item)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files = files.concat(getAllFilesRecursive(fullPath, baseDir))
    } else {
      const relPath = path.relative(baseDir, fullPath)
      files.push({ relativePath: relPath, absolutePath: fullPath })
    }
  }
  return files
}

function getSkillsFilesRecursive(dir: string, baseDir: string = dir): { relativePath: string; absolutePath: string }[] {
  let files: { relativePath: string; absolutePath: string }[] = []
  if (!existsSync(dir)) return files

  const list = readdirSync(dir)
  for (const item of list) {
    if (item === "node_modules" || item === ".git") continue
    
    const fullPath = path.join(dir, item)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files = files.concat(getSkillsFilesRecursive(fullPath, baseDir))
    } else {
      const ext = path.extname(item).toLowerCase()
      if ([".md", ".json", ".jsonc", ".js", ".ts", ".txt", ""].includes(ext)) {
        const relPath = path.relative(baseDir, fullPath)
        files.push({ relativePath: relPath, absolutePath: fullPath })
      }
    }
  }
  return files
}

export function performFullBackup(destPath?: string, workspaceDir?: string): BackupResult {
  try {
    let configDir = path.join(os.homedir(), ".config", "opencode")
    if (process.env.OPENCODE_CONFIG_DIR) {
      configDir = process.env.OPENCODE_CONFIG_DIR
    } else if (!existsSync(configDir)) {
      const altDir = path.join(os.homedir(), ".opencode")
      if (existsSync(altDir)) {
        configDir = altDir
      }
    }

    if (!existsSync(configDir)) {
      return {
        success: false,
        mergedFiles: [],
        error: `OpenCode config directory not found at: ${configDir}`
      }
    }

    const fileEntries = getAllFilesRecursive(configDir)
    if (fileEntries.length === 0) {
      return {
        success: false,
        mergedFiles: [],
        error: "No config files found to back up."
      }
    }

    const backupPayload: {
      version: number
      timestamp: number
      files: Record<string, string>
      skills: Record<string, string>
    } = {
      version: 1,
      timestamp: Date.now(),
      files: {},
      skills: {}
    }

    const backedUpFiles: string[] = []
    
    for (const entry of fileEntries) {
      if (entry.relativePath.startsWith("skills/")) continue
      try {
        const content = readFileSync(entry.absolutePath, "utf-8")
        backupPayload.files[entry.relativePath] = content
        backedUpFiles.push(entry.absolutePath)
      } catch (e) {
        // Skip
      }
    }

    if (workspaceDir) {
      let cleanWorkspaceDir = workspaceDir.trim()
      if (cleanWorkspaceDir.startsWith("~")) {
        cleanWorkspaceDir = cleanWorkspaceDir.replace("~", os.homedir())
      }
      const workspaceSkillsDir = path.join(cleanWorkspaceDir, ".opencode", "skills")
      if (existsSync(workspaceSkillsDir)) {
        const workspaceSkillsFiles = getSkillsFilesRecursive(workspaceSkillsDir)
        for (const entry of workspaceSkillsFiles) {
          try {
            const content = readFileSync(entry.absolutePath, "utf-8")
            backupPayload.skills[entry.relativePath] = content
            backedUpFiles.push(entry.absolutePath)
          } catch {}
        }
      }
    }

    const globalSkillsDir = path.join(configDir, "skills")
    if (existsSync(globalSkillsDir)) {
      const globalSkillsFiles = getSkillsFilesRecursive(globalSkillsDir)
      for (const entry of globalSkillsFiles) {
        try {
          const content = readFileSync(entry.absolutePath, "utf-8")
          if (!backupPayload.skills[entry.relativePath]) {
            backupPayload.skills[entry.relativePath] = content
            backedUpFiles.push(entry.absolutePath)
          }
        } catch {}
      }
    }

    let finalDestFile = ""
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 17)
    const defaultFilename = `opencode-backup-${ts}.json`

    if (destPath) {
      let resolvedDest = destPath.trim()
      if (resolvedDest.startsWith("~")) {
        resolvedDest = resolvedDest.replace("~", os.homedir())
      }
      resolvedDest = path.resolve(resolvedDest)

      if (existsSync(resolvedDest) && statSync(resolvedDest).isDirectory()) {
        finalDestFile = path.join(resolvedDest, defaultFilename)
      } else {
        const parentDir = path.dirname(resolvedDest)
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true })
        }
        finalDestFile = resolvedDest
      }
    } else {
      finalDestFile = path.join(os.homedir(), defaultFilename)
    }

    writeFileSync(finalDestFile, JSON.stringify(backupPayload, null, 2), "utf-8")

    return {
      success: true,
      mergedFiles: backedUpFiles,
      destFile: finalDestFile
    }
  } catch (e: any) {
    return {
      success: false,
      mergedFiles: [],
      error: e?.message || String(e)
    }
  }
}

export function performFullRestore(backupFilePath: string, workspaceDir?: string): { success: boolean; safetyBackup?: string; error?: string } {
  try {
    let resolvedBackupPath = backupFilePath.trim()
    if (resolvedBackupPath.startsWith("~")) {
      resolvedBackupPath = resolvedBackupPath.replace("~", os.homedir())
    }
    resolvedBackupPath = path.resolve(resolvedBackupPath)

    if (!existsSync(resolvedBackupPath)) {
      return { success: false, error: `Backup file not found at: ${resolvedBackupPath}` }
    }

    const raw = readFileSync(resolvedBackupPath, "utf-8")
    const payload = JSON.parse(raw)

    if (!payload || payload.version !== 1 || !payload.files) {
      return { success: false, error: "Invalid backup file format or version mismatch." }
    }

    let configDir = path.join(os.homedir(), ".config", "opencode")
    if (process.env.OPENCODE_CONFIG_DIR) {
      configDir = process.env.OPENCODE_CONFIG_DIR
    } else {
      const altDir = path.join(os.homedir(), ".opencode")
      if (existsSync(altDir) && !existsSync(configDir)) {
        configDir = altDir
      }
    }

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }

    let safetyBackupFile: string | undefined = undefined
    const existingFiles = getAllFilesRecursive(configDir)
    let workspaceSkillsFiles: { relativePath: string; absolutePath: string }[] = []
    if (workspaceDir) {
      let cleanWorkspaceDir = workspaceDir.trim()
      if (cleanWorkspaceDir.startsWith("~")) {
        cleanWorkspaceDir = cleanWorkspaceDir.replace("~", os.homedir())
      }
      const workspaceSkillsDir = path.join(cleanWorkspaceDir, ".opencode", "skills")
      if (existsSync(workspaceSkillsDir)) {
        workspaceSkillsFiles = getSkillsFilesRecursive(workspaceSkillsDir)
      }
    }

    if (existingFiles.length > 0 || workspaceSkillsFiles.length > 0) {
      const safetyPayload = {
        version: 1,
        timestamp: Date.now(),
        files: {} as Record<string, string>,
        skills: {} as Record<string, string>
      }
      for (const entry of existingFiles) {
        try {
          safetyPayload.files[entry.relativePath] = readFileSync(entry.absolutePath, "utf-8")
        } catch {}
      }
      for (const entry of workspaceSkillsFiles) {
        try {
          safetyPayload.skills[entry.relativePath] = readFileSync(entry.absolutePath, "utf-8")
        } catch {}
      }
      const safetyFilename = `opencode-safety-backup-${Date.now()}.json`
      safetyBackupFile = path.join(os.homedir(), safetyFilename)
      writeFileSync(safetyBackupFile, JSON.stringify(safetyPayload, null, 2), "utf-8")
    }

    for (const [relPath, content] of Object.entries(payload.files)) {
      const targetPath = path.join(configDir, relPath)
      const targetParent = path.dirname(targetPath)
      if (!existsSync(targetParent)) {
        mkdirSync(targetParent, { recursive: true })
      }
      writeFileSync(targetPath, content as string, "utf-8")
    }

    if (payload.skills) {
      for (const [relPath, content] of Object.entries(payload.skills)) {
        const globalSkillPath = path.join(configDir, "skills", relPath)
        const globalSkillParent = path.dirname(globalSkillPath)
        if (!existsSync(globalSkillParent)) {
          mkdirSync(globalSkillParent, { recursive: true })
        }
        writeFileSync(globalSkillPath, content as string, "utf-8")

        if (workspaceDir) {
          let cleanWorkspaceDir = workspaceDir.trim()
          if (cleanWorkspaceDir.startsWith("~")) {
            cleanWorkspaceDir = cleanWorkspaceDir.replace("~", os.homedir())
          }
          const workspaceSkillPath = path.join(cleanWorkspaceDir, ".opencode", "skills", relPath)
          const workspaceSkillParent = path.dirname(workspaceSkillPath)
          if (!existsSync(workspaceSkillParent)) {
            mkdirSync(workspaceSkillParent, { recursive: true })
          }
          writeFileSync(workspaceSkillPath, content as string, "utf-8")
        }
      }
    }

    return {
      success: true,
      safetyBackup: safetyBackupFile
    }
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || String(e)
    }
  }
}
