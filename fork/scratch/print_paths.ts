import { Global } from "@opencode-ai/core/global"
import { existsSync } from "fs"

console.log("--- Opencode Paths ---")
console.log("Config Path:", Global.Path.config)
console.log("Data Path:  ", Global.Path.data)

const candidates = ["opencode.jsonc", "opencode.json", "config.json"]
console.log("\n--- Checking for config files ---")
for (const file of candidates) {
    const fullPath = `${Global.Path.config}/${file}`
    console.log(`${file}: ${existsSync(fullPath) ? "EXISTS" : "MISSING"} (${fullPath})`)
}
