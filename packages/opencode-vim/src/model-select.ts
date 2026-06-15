// Command: interactive model selector for CLI
// Allows user to pick a default model from the config.json using arrow keys.

import { cmd } from "@opencode/cli/cmd/cmd"
import { UI } from "@opencode/cli/ui"
import { Global } from "@opencode-ai/core/global"
import path from "path"
import fs from "fs/promises"
import readline from "readline"

export const ModelSelectCommand = cmd({
  command: "model-select",
  describe: "Interactively select a default model from config.json",
  builder: (yargs) => yargs,
  handler: async () => {
    const configPath = path.join(Global.Path.config, "config.json")
    const text = await fs.readFile(configPath, "utf-8").catch(() => "")
    if (!text) {
      UI.println(UI.Style.TEXT_DANGER_BOLD + "config.json not found or empty" + UI.Style.TEXT_NORMAL)
      return
    }
    const cfg = JSON.parse(text) as any
    const providers = cfg.provider ?? {}
    const options: { title: string; value: string }[] = []
    for (const [providerId, provider] of Object.entries(providers)) {
      const models = (provider as any).models ?? {}
      for (const modelId of Object.keys(models)) {
        options.push({ title: `${providerId}/${modelId}`, value: `${providerId}/${modelId}` })
      }
    }
    if (options.length === 0) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "No models defined in config" + UI.Style.TEXT_NORMAL)
      return
    }

    // Setup readline for raw keypress handling
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)

    let index = 0
    const render = () => {
      // clear screen
      process.stdout.write("\x1b[2J\x1b[0;0H")
      console.log("Use ↑/↓ arrows to move, Enter to select, Esc/Ctrl+C to cancel")
      options.forEach((opt, i) => {
        const prefix = i === index ? "> " : "  "
        const line = i === index ? `\x1b[7m${opt.title}\x1b[0m` : opt.title
        console.log(prefix + line)
      })
    }

    render()

    let selectedModel: string | undefined = undefined

    const cleanup = () => {
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdin.removeAllListeners("keypress")
      process.stdout.write("\x1b[?25h") // show cursor
    }

    const finish = (selected?: string) => {
      selectedModel = selected
      cleanup()
    }

    const onKey = (str: string, key: any) => {
      if (key.name === "up") {
        index = (index - 1 + options.length) % options.length
        render()
      } else if (key.name === "down") {
        index = (index + 1) % options.length
        render()
      } else if (key.name === "return") {
        const selected = options[index].value
        finish(selected)
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        finish()
      }
    }

    process.stdin.on("keypress", onKey)
    // Keep the command alive until a selection is made.
    // The promise resolves when raw mode is turned off (i.e., after finish())
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!process.stdin.isRaw) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
    })
    // After the user has selected (or cancelled), update the config if needed
    if (selectedModel) {
      cfg.model = selectedModel
      await fs.writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`)
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Default model set to ${selectedModel}` + UI.Style.TEXT_NORMAL)
    } else {
      UI.println("Selection cancelled")
    }
  },
})
