import { OpenCode } from "@opencode/client/promise"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

export async function selectModel() {
  const api = OpenCode.make({ baseUrl: process.env.OPENCODE_SERVER ?? "http://127.0.0.1:4096" })
  const location = { directory: process.cwd() }
  const [providers, models, documents] = await Promise.all([
    api.provider.list({ location }), api.model.list({ location }), api.config.get({ location }),
  ])
  const options = models.data.flatMap((model) => {
    const provider = providers.data.find((item) => item.id === model.providerID)
    return provider ? [{ providerID: model.providerID, modelID: model.id, label: `${provider.name}/${model.name}` }] : []
  })
  if (!options.length) throw new Error("No models are available for this location")
  let index = 0
  const config = documents.findLast((item) => item.type === "document")
  const configPath = config?.type === "document" ? config.path : path.join(os.homedir(), ".config/opencode/opencode.json")
  if (!configPath) throw new Error("No writable OpenCode configuration document was found")
  const current = config?.type === "document" ? config.info.model : undefined
  const selected = typeof current === "string" ? options.findIndex((item) => item.label === current) : -1
  if (selected >= 0) index = selected
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  const render = () => {
    process.stdout.write("\x1b[2J\x1b[HSelect model: ↑/↓, Enter, Esc\n")
    options.forEach((item, i) => process.stdout.write(`${i === index ? ">" : " "} ${item.label}\n`))
  }
  render()
  await new Promise<void>((resolve) => {
    const onKey = (_: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.name === "up") index = (index + options.length - 1) % options.length
      else if (key.name === "down") index = (index + 1) % options.length
      else if (key.name === "return") {
        cleanup()
        void (async () => {
          const contents = await readFile(configPath, "utf8").catch(() => "{}")
          const value: unknown = JSON.parse(contents)
          if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("OpenCode config must contain a JSON object")
          await writeFile(configPath, JSON.stringify({ ...value, model: `${options[index].providerID}/${options[index].modelID}` }, null, 2) + "\n")
          resolve()
        })()
        return
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) { cleanup(); resolve(); return }
      render()
    }
    const cleanup = () => { process.stdin.off("keypress", onKey); process.stdin.setRawMode?.(false) }
    process.stdin.on("keypress", onKey)
  })
}
