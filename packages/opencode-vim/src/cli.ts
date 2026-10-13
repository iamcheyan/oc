import { OpenCode } from "@opencode/client/promise"
import type { SessionMessageInfo } from "@opencode/client"

const api = OpenCode.make({ baseUrl: process.env.OPENCODE_SERVER ?? "http://127.0.0.1:4096" })

export async function runCli(options: { directory?: string; session?: string; prompt?: string; model?: string; agent?: string }) {
  const directory = options.directory ?? process.cwd()
  const location = { directory }
  let sessionID = options.session
  if (options.prompt) {
    sessionID ??= (await api.session.create({ location })).id
    await api.session.prompt({ sessionID, text: options.prompt, ...(options.agent ? { agents: [{ name: options.agent }] } : {}) })
    const messages = await api.message.list({ sessionID, limit: 50, order: "asc" })
    for (const message of messages.data) {
      if (message.type !== "assistant") continue
      const text = message.content.filter((part) => part.type === "text" || part.type === "reasoning").map((part) => part.text).join("\n")
      if (text) process.stdout.write(text + "\n")
    }
    return
  }
  const sessions = await api.session.list({ directory, limit: 20, order: "desc" })
  const models = await api.model.list({ location })
  const agents = await api.agent.list({ location })
  process.stdout.write(`OpenCode Vim 2.0\n${directory}\n`)
  if (sessionID) process.stdout.write(`session ${sessionID}\n`)
  process.stdout.write(`models ${models.data.length} • agents ${agents.data.length} • sessions ${sessions.data.length}\n`)
  process.stdout.write("Use --prompt <text> to run a prompt.\n")
}

export function displayMessage(message: SessionMessageInfo) {
  if (message.type !== "assistant") return ""
  return message.content.filter((part) => part.type === "text" || part.type === "reasoning").map((part) => part.text).join("\n")
}
