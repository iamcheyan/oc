import type { Argv } from "yargs"
import path from "path"
import { createInterface } from "readline/promises"
import { UI } from "@opencode/cli/ui"
import { cmd } from "@opencode/cli/cmd/cmd"
import { bootstrap } from "@opencode/cli/bootstrap"
import { createOpencodeClient, type OpencodeClient, type ToolPart, type SubtaskPart } from "@opencode-ai/sdk/v2"
import { Server } from "@opencode/server/server"
import { Provider } from "@/provider/provider"
import { Tool } from "@/tool/tool"
import { GlobTool } from "@opencode/tool/glob"
import { GrepTool } from "@opencode/tool/grep"
import { ReadTool } from "@opencode/tool/read"
import { WebFetchTool } from "@opencode/tool/webfetch"
import { EditTool } from "@opencode/tool/edit"
import { WriteTool } from "@opencode/tool/write"
import { WebSearchTool } from "@opencode/tool/websearch"
import { TaskTool } from "@opencode/tool/task"
import { SkillTool } from "@opencode/tool/skill"
import { ShellTool } from "@opencode/tool/shell"
import { ShellID } from "@opencode/tool/shell/id"
import { TodoWriteTool } from "@opencode/tool/todo"
import { Locale } from "@/util/locale"
import { EOL } from "os"

type ToolProps<T> = {
  input: Tool.InferParameters<T>
  metadata: Tool.InferMetadata<T>
  part: ToolPart
}

function props<T>(part: ToolPart): ToolProps<T> {
  const state = part.state
  return {
    input: state.input as Tool.InferParameters<T>,
    metadata: ("metadata" in state ? state.metadata : {}) as Tool.InferMetadata<T>,
    part,
  }
}

type Inline = {
  icon: string
  title: string
  description?: string
}

function inline(info: Inline) {
  const suffix = info.description ? UI.Style.TEXT_DIM + ` ${info.description}` + UI.Style.TEXT_NORMAL : ""
  UI.println(UI.Style.TEXT_NORMAL + info.icon, UI.Style.TEXT_NORMAL + info.title + suffix)
}

function normalPath(input?: string) {
  if (!input) return ""
  if (path.isAbsolute(input)) return path.relative(process.cwd(), input) || "."
  return input
}

function glob(info: ToolProps<typeof GlobTool>) {
  const root = info.input.path ?? ""
  const title = `Glob "${info.input.pattern}"`
  const suffix = root ? `in ${normalPath(root)}` : ""
  const num = info.metadata.count
  const description = num === undefined ? suffix : `${suffix}${suffix ? " · " : ""}${num} ${num === 1 ? "match" : "matches"}`
  inline({ icon: "✱", title, ...(description && { description }) })
}

function grep(info: ToolProps<typeof GrepTool>) {
  const root = info.input.path ?? ""
  const title = `Grep "${info.input.pattern}"`
  const suffix = root ? `in ${normalPath(root)}` : ""
  const num = info.metadata.matches
  const description = num === undefined ? suffix : `${suffix}${suffix ? " · " : ""}${num} ${num === 1 ? "match" : "matches"}`
  inline({ icon: "✱", title, ...(description && { description }) })
}

function read(info: ToolProps<typeof ReadTool>) {
  const file = normalPath(info.input.filePath)
  const title = `Read ${file}`
  inline({ icon: "→", title })
}

function write(info: ToolProps<typeof WriteTool>) {
  const title = `Write ${normalPath(info.input.filePath)}`
  inline({ icon: "←", title })
}

function webfetch(info: ToolProps<typeof WebFetchTool>) {
  inline({ icon: "%", title: `WebFetch ${info.input.url}` })
}

function edit(info: ToolProps<typeof EditTool>) {
  const title = normalPath(info.input.filePath)
  inline({ icon: "←", title: `Edit ${title}` })
}

function websearch(info: ToolProps<typeof WebSearchTool>) {
  inline({ icon: "◈", title: `Search "${info.input.query}"` })
}

function task(info: ToolProps<typeof TaskTool>) {
  const state = info.part.state
  const input = info.part.state.input as Record<string, unknown>
  const subagent = typeof input.subagent_type === "string" && input.subagent_type.trim().length > 0 ? input.subagent_type : "unknown"
  const agent = Locale.titlecase(subagent)
  const desc = typeof input.description === "string" && input.description.trim().length > 0 ? input.description : undefined
  const icon = state.status === "error" ? "✗" : state.status === "running" ? "•" : "✓"
  const name = desc ?? `${agent} Task`
  inline({ icon, title: name, description: desc ? `${agent} Agent` : undefined })
}

function skill(info: ToolProps<typeof SkillTool>) {
  inline({ icon: "◇", title: `Skill "${info.input.name}"` })
}

function shell(info: ToolProps<typeof ShellTool>) {
  inline({ icon: "$", title: `${info.input.command}` })
}

function todo(info: ToolProps<typeof TodoWriteTool>) {
  const items = info.input.todos
  inline({ icon: "☰", title: "Todos", description: items.length ? `${items.length} items` : undefined })
}

function toolRender(part: ToolPart) {
  try {
    if (part.tool === ShellID.ToolID) return shell(props<typeof ShellTool>(part))
    if (part.tool === "glob") return glob(props<typeof GlobTool>(part))
    if (part.tool === "grep") return grep(props<typeof GrepTool>(part))
    if (part.tool === "read") return read(props<typeof ReadTool>(part))
    if (part.tool === "write") return write(props<typeof WriteTool>(part))
    if (part.tool === "webfetch") return webfetch(props<typeof WebFetchTool>(part))
    if (part.tool === "edit") return edit(props<typeof EditTool>(part))
    if (part.tool === "websearch") return websearch(props<typeof WebSearchTool>(part))
    if (part.tool === "task") return task(props<typeof TaskTool>(part))
    if (part.tool === "todowrite") return todo(props<typeof TodoWriteTool>(part))
    if (part.tool === "skill") return skill(props<typeof SkillTool>(part))
    fallback(part)
  } catch {
    fallback(part)
  }
}

function fallback(part: ToolPart) {
  const state = part.state
  const input = "input" in state ? state.input : undefined
  const title = ("title" in state && typeof state.title === "string" ? state.title : undefined) ??
    (input && typeof input === "object" && Object.keys(input).length > 0 ? JSON.stringify(input) : "Unknown")
  inline({ icon: "⚙", title: `${part.tool} ${title}` })
}

function renderSubtask(info: SubtaskPart) {
  inline({ icon: "◇", title: `${info.agent}: ${info.description}` })
}

type State = {
  sessionID: string
  agent: string
  model?: { providerID: string; modelID: string }
  modelLabel: string
  thinking: boolean
}

type Pending = {
  sessionID: string
  resolve: () => void
}

const SLASH_COMMANDS = ["help", "exit", "quit", "clear", "new", "sessions", "model", "agent", "thinking"]

function completer(line: string): [string[], string] {
  if (!line.startsWith("/") && !line.startsWith(":")) return [[], line]
  const partial = line.slice(1).toLowerCase()
  const hits = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(partial)).map((cmd) => "/" + cmd)
  return [hits.length ? hits : SLASH_COMMANDS.map((cmd) => "/" + cmd), line]
}

async function chooseModel(sdk: OpencodeClient, requested?: string) {
  const providers = await sdk.config.providers(undefined, { throwOnError: true })
  if (requested) {
    const [providerID, ...rest] = requested.split("/")
    const modelID = rest.join("/")
    if (providerID && modelID) {
      const match = providers.data.providers.find((p) => p.id === providerID)
      if (match?.models[modelID]) return { providerID, modelID }
    }
  }
  for (const provider of providers.data.providers) {
    const defaultModel = providers.data.default[provider.id]
    if (defaultModel && provider.models[defaultModel]) return { providerID: provider.id, modelID: defaultModel }
  }
  for (const provider of providers.data.providers) {
    const modelID = Object.keys(provider.models)[0]
    if (modelID) return { providerID: provider.id, modelID }
  }
}

async function initSession(sdk: OpencodeClient, input: { sessionID?: string; continueLast?: boolean }) {
  if (input.sessionID) return input.sessionID
  if (input.continueLast) {
    const sessions = await sdk.session.list({ limit: 20 }, { throwOnError: true })
    const last = sessions.data.find((item) => !item.parentID)
    if (last) return last.id
  }
  return (await sdk.session.create(undefined, { throwOnError: true })).data.id
}

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
let spinnerInterval: ReturnType<typeof setInterval> | undefined

function startSpinner() {
  if (spinnerInterval) return
  let i = 0
  process.stderr.write(`\r${UI.Style.TEXT_DIM}${spinnerFrames[i]} Thinking...${UI.Style.TEXT_NORMAL}`)
  i++
  spinnerInterval = setInterval(() => {
    process.stderr.write(`\r${UI.Style.TEXT_DIM}${spinnerFrames[i % spinnerFrames.length]} Thinking...${UI.Style.TEXT_NORMAL}`)
    i++
  }, 80)
}

function stopSpinner() {
  if (!spinnerInterval) return
  clearInterval(spinnerInterval)
  spinnerInterval = undefined
  process.stderr.write("\r\x1b[K")
}

export const CliCommand = cmd({
  command: "cli",
  describe: "interactive CLI REPL",
  builder: (yargs: Argv) =>
    yargs
      .option("model", { type: "string", alias: ["m"], describe: "model in provider/model format" })
      .option("agent", { type: "string", describe: "agent to use" })
      .option("session", { type: "string", alias: ["s"], describe: "session id to continue" })
      .option("prompt", { type: "string", describe: "initial prompt" })
      .option("continue", { type: "boolean", alias: ["c"], default: false, describe: "continue last session" })
      .option("thinking", { type: "boolean", default: false, describe: "show thinking blocks" })
      .option("dangerously-skip-permissions", { type: "boolean", default: false, describe: "auto-approve permissions" })
      .option("dir", { type: "string", describe: "directory to run in" }),
  handler: async (args) => {
    const directory = process.cwd()
    if (args.dir) {
      try {
        process.chdir(args.dir)
      } catch {
        UI.println(UI.Style.TEXT_DANGER_BOLD + "Error:", UI.Style.TEXT_NORMAL + `directory not found: ${args.dir}`)
        process.exit(1)
      }
    }

    if (!process.stdin.isTTY) {
      UI.println(UI.Style.TEXT_DANGER_BOLD + "Error:", UI.Style.TEXT_NORMAL + "cli requires an interactive terminal")
      process.exit(1)
    }

    const initialPrompt = args.prompt?.trim()
    const skipPermissions = args["dangerously-skip-permissions"] === true

    await bootstrap(process.cwd(), async () => {
      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        return Server.Default().app.fetch(request)
      }) as typeof globalThis.fetch

      const sdk = createOpencodeClient({ baseUrl: "http://opencode.internal", fetch: fetchFn })

      const sessionID = await initSession(sdk, { sessionID: args.session, continueLast: args.continue })
      const model = await chooseModel(sdk, args.model)
      const cfg = await sdk.config.get(undefined, { throwOnError: true })

      const state: State = {
        sessionID,
        agent: args.agent ?? cfg.data?.default_agent ?? "build",
        model,
        modelLabel: model ? `${model.providerID}/${model.modelID}` : "default",
        thinking: args.thinking === true,
      }

      const events = await sdk.event.subscribe()
      let pending: Pending | undefined
      let activeTurn = false
      let headerShown = false
      const partTypes = new Map<string, string>()
      const streamedParts = new Set<string>()
      const reasoningBuf = new Map<string, string>()
      const seenRunning = new Set<string>()

      const ask = async (input: string) => {
        if (!input.trim()) return
        const done = new Promise<void>((resolve) => {
          pending = { sessionID: state.sessionID, resolve }
        })
        activeTurn = true
        headerShown = false
        partTypes.clear()
        streamedParts.clear()
        reasoningBuf.clear()
        seenRunning.clear()
        startSpinner()
        await sdk.session.prompt(
          { sessionID: state.sessionID, agent: state.agent, model: state.model, parts: [{ type: "text", text: input.trim() }] },
          { throwOnError: true },
        )
        await done
        stopSpinner()
      }

      void (async () => {
        for await (const event of events.stream) {
          if (
            event.type === "message.updated" &&
            event.properties.info.sessionID === state.sessionID &&
            event.properties.info.role === "assistant" &&
            !headerShown
          ) {
            stopSpinner()
            UI.empty()
            UI.println(`> ${event.properties.info.agent} · ${event.properties.info.modelID}`)
            UI.empty()
            headerShown = true
          }

          if (event.type === "message.part.updated") {
            const part = event.properties.part
            if (part.sessionID !== state.sessionID) continue

            if (part.type === "subtask") {
              renderSubtask(part)
            }

            if (part.type === "tool") {
              const running = part.state.status === "running"
              const done = part.state.status === "completed" || part.state.status === "error"

              if (running && !seenRunning.has(part.id)) {
                toolRender(part)
                seenRunning.add(part.id)
              }
              if (done) {
                toolRender(part)
                if (part.state.status === "error") {
                  UI.println(UI.Style.TEXT_DANGER_BOLD + "Error:", UI.Style.TEXT_NORMAL + String(part.state.error))
                }
              }
            }

            if ((part.type === "text" || part.type === "reasoning") && !part.time?.end) {
              partTypes.set(part.id, part.type)
            }

            if (part.type === "text" && part.time?.end) {
              if (streamedParts.has(part.id)) {
                process.stderr.write(EOL)
              } else {
                const text = part.text.trim()
                if (text) {
                  UI.empty()
                  UI.println(text)
                  UI.empty()
                }
              }
            }

            if (part.type === "reasoning" && part.time?.end && state.thinking) {
              if (streamedParts.has(part.id)) {
                process.stderr.write(EOL)
              } else {
                const text = part.text.trim()
                if (text) {
                  UI.empty()
                  UI.println(UI.Style.TEXT_DIM + "\u001b[3m" + text + "\u001b[0m" + UI.Style.TEXT_NORMAL)
                  UI.empty()
                }
              }
            }
          }

          if (event.type === "message.part.delta" && event.properties.sessionID === state.sessionID) {
            const pt = partTypes.get(event.properties.partID)
            if (pt === "text") {
              process.stderr.write(event.properties.delta)
              streamedParts.add(event.properties.partID)
            } else if (pt === "reasoning" && state.thinking) {
              const existing = reasoningBuf.get(event.properties.partID) ?? ""
              const updated = existing + event.properties.delta
              reasoningBuf.set(event.properties.partID, updated)
              process.stderr.write(`\r${UI.Style.TEXT_DIM}\x1b[3m${updated}\x1b[0m${UI.Style.TEXT_NORMAL}`)
              streamedParts.add(event.properties.partID)
            }
          }

          if (event.type === "permission.asked" && event.properties.sessionID === state.sessionID) {
            await sdk.permission.reply({ requestID: event.properties.id, reply: skipPermissions ? "once" : "reject" })
            if (!skipPermissions) {
              UI.println(UI.Style.TEXT_WARNING_BOLD + "!", `permission requested: ${event.properties.permission}; auto-rejecting`)
            }
          }

          if (event.type === "session.error" && event.properties.sessionID === state.sessionID && event.properties.error) {
            stopSpinner()
            const issue =
              "data" in event.properties.error &&
              event.properties.error.data &&
              typeof event.properties.error.data === "object" &&
              "message" in event.properties.error.data
                ? String(event.properties.error.data.message)
                : String(event.properties.error.name)
            UI.println(UI.Style.TEXT_DANGER_BOLD + "Error:", UI.Style.TEXT_NORMAL + issue)
          }

          if (event.type === "session.status" && event.properties.sessionID === state.sessionID) {
            if (event.properties.status.type === "idle" && pending?.sessionID === state.sessionID) {
              activeTurn = false
              pending.resolve()
              pending = undefined
            }
          }
        }
      })()

      UI.println(UI.Style.TEXT_DIM + "opencode cli" + UI.Style.TEXT_NORMAL)
      UI.println(`agent ${state.agent} · model ${state.modelLabel} · Tab to autocomplete`)
      UI.println(`dir ${process.cwd()}`)
      UI.println(`ctrl+d to exit · /help for commands`)
      UI.println()

      if (initialPrompt && initialPrompt !== "/exit" && initialPrompt !== "/quit" && initialPrompt !== ":q") {
        await ask(initialPrompt)
      }

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdout.isTTY,
        completer,
      })

      let lastInterrupt = 0
      rl.on("SIGINT", () => {
        if (activeTurn) {
          activeTurn = false
          sdk.session.abort({ sessionID: state.sessionID }).catch(() => undefined)
          UI.println("")
          UI.println(UI.Style.TEXT_DIM + "Interrupted" + UI.Style.TEXT_NORMAL)
          return
        }
        const now = Date.now()
        if (now - lastInterrupt < 500) {
          UI.println("")
          process.exit(0)
        }
        lastInterrupt = now
        UI.println("")
        UI.println(UI.Style.TEXT_DIM + "(Press Ctrl+C again to exit)" + UI.Style.TEXT_NORMAL)
        rl.prompt()
      })

      while (true) {
        const line = await rl.question(UI.Style.TEXT_HIGHLIGHT_BOLD + "➜ " + UI.Style.TEXT_NORMAL).catch(() => undefined)
        if (line === undefined) break
        const trimmed = line.trim()
        if (!trimmed) continue

        if (trimmed === "/help") {
          UI.println(UI.Style.TEXT_DIM + "Commands:" + UI.Style.TEXT_NORMAL)
          UI.println("  /help              show this help")
          UI.println("  /exit, /quit, :q   leave the CLI")
          UI.println("  /clear             clear the screen")
          UI.println("  /new               create a new session")
          UI.println("  /sessions          list recent sessions")
          UI.println("  /model [name]      show or switch model")
          UI.println("  /agent [name]      show or switch agent")
          UI.println("  /thinking          toggle reasoning display")
          continue
        }

        if (trimmed === "/clear") {
          process.stdout.write("\x1b[2J\x1b[H")
          continue
        }

        if (trimmed === "/exit" || trimmed === "/quit" || trimmed === ":q") break

        if (trimmed === "/thinking") {
          state.thinking = !state.thinking
          UI.println(UI.Style.TEXT_DIM + `thinking ${state.thinking ? "on" : "off"}` + UI.Style.TEXT_NORMAL)
          continue
        }

        if (trimmed === "/new") {
          state.sessionID = (await sdk.session.create(undefined, { throwOnError: true })).data.id
          UI.println(UI.Style.TEXT_INFO_BOLD + "~  " + UI.Style.TEXT_NORMAL + `new session ${state.sessionID.slice(-6)}`)
          continue
        }

        if (trimmed === "/sessions") {
          const sessions = await sdk.session.list({ limit: 20 }, { throwOnError: true })
          for (const item of sessions.data.filter((e) => !e.parentID)) {
            const marker = item.id === state.sessionID ? "*" : " "
            UI.println(`${marker} ${item.id.slice(-6)}  ${item.title ?? "(untitled)"}`)
          }
          continue
        }

        if (trimmed === "/model") {
          const providers = await sdk.config.providers(undefined, { throwOnError: true })
          UI.println(UI.Style.TEXT_DIM + `current: ${state.modelLabel}` + UI.Style.TEXT_NORMAL)
          for (const provider of providers.data.providers) {
            for (const modelID of Object.keys(provider.models)) {
              UI.println(`  ${provider.id}/${modelID}`)
            }
          }
          continue
        }

        if (trimmed.startsWith("/model ")) {
          const [providerID, ...rest] = trimmed.slice("/model ".length).trim().split("/")
          const modelID = rest.join("/")
          if (!providerID || !modelID) {
            UI.println(UI.Style.TEXT_DANGER_BOLD + "Error:", UI.Style.TEXT_NORMAL + "model must be in provider/model format")
            continue
          }
          state.model = { providerID, modelID }
          state.modelLabel = `${providerID}/${modelID}`
          UI.println(UI.Style.TEXT_DIM + `model → ${state.modelLabel}` + UI.Style.TEXT_NORMAL)
          continue
        }

        if (trimmed === "/agent") {
          const agents = await sdk.app.agents(undefined, { throwOnError: true })
          UI.println(UI.Style.TEXT_DIM + `current: ${state.agent}` + UI.Style.TEXT_NORMAL)
          for (const item of agents.data.filter((e) => e.mode !== "subagent")) UI.println(`  ${item.name}`)
          continue
        }

        if (trimmed.startsWith("/agent ")) {
          state.agent = trimmed.slice("/agent ".length).trim() || state.agent
          UI.println(UI.Style.TEXT_DIM + `agent → ${state.agent}` + UI.Style.TEXT_NORMAL)
          continue
        }

        await ask(trimmed)
      }

      rl.close()
    })
  },
})
