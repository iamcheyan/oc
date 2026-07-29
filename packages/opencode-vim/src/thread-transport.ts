import { Rpc } from "@opencode/util/rpc"
import type { rpc } from "@opencode/cli/tui/worker"
import path from "path"
import { fileURLToPath } from "url"
import { TuiConfig } from "@opencode/config/tui"
import { UI } from "@opencode/cli/ui"
import { errorMessage } from "@tui/util/error"
import { withTimeout } from "@opencode/util/timeout"
import { resolveNetworkOptionsNoConfig, hasArg, type NetworkOptions } from "@opencode/cli/network"
import { Filesystem } from "@opencode/util/filesystem"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import type { EventSource } from "@tui/context/sdk"
import { writeHeapSnapshot } from "v8"
import { ServerAuth } from "@opencode/server/auth"
import { validateSession } from "@opencode/cli/tui/validate-session"
import { win32InstallCtrlCGuard } from "@tui/terminal-win32"
import { resolveThreadDirectory } from "@opencode/cli/cmd/tui"
import { createLegacyTuiPluginHost } from "@opencode/plugin/tui/runtime"
import type { TuiPluginHost } from "@tui/plugin/runtime"

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

type TransportArgs = NetworkOptions & {
  project?: string
  fork?: boolean
  continue?: boolean
  session?: string
  model?: string
  agent?: string
  prompt?: string
  auto?: boolean
  yolo?: boolean
  "dangerously-skip-permissions"?: boolean
}

export type ThreadTransport = {
  url: string
  fetch: typeof fetch | undefined
  events: EventSource | undefined
  headers: RequestInit["headers"] | undefined
  config: TuiConfig.Resolved
  directory: string
  pluginHost: TuiPluginHost
  args: {
    continue: boolean | undefined
    sessionID: string | undefined
    agent: string | undefined
    model: string | undefined
    prompt: string | undefined
    fork: boolean | undefined
    auto: boolean
  }
  onSnapshot: (() => Promise<string[]>) | undefined
  stop: () => Promise<void>
}

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    subscribe: async (handler) => {
      return client.on<GlobalEvent>("global.event", (e) => {
        handler(e)
      })
    },
  }
}

async function target() {
  if (typeof OPENCODE_WORKER_PATH !== "undefined") return OPENCODE_WORKER_PATH
  const dist = new URL("./cli/tui/worker.js", import.meta.url)
  if (await Filesystem.exists(fileURLToPath(dist))) return dist
  return new URL("../tui/worker.ts", import.meta.url)
}

async function readPrompt(value?: string) {
  const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

export async function createThreadTransport(args: TransportArgs): Promise<ThreadTransport> {
  if (args.fork && !args.continue && !args.session) {
    UI.error("--fork requires --continue or --session")
    process.exitCode = 1
    throw new Error("--fork requires --continue or --session")
  }

  const unguard = win32InstallCtrlCGuard()

  const next = resolveThreadDirectory(args.project)
  const file = await target()
  try {
    process.chdir(next)
  } catch {
    UI.error("Failed to change directory to " + next)
    throw new Error("Failed to change directory to " + next)
  }
  const cwd = Filesystem.resolve(process.cwd())

  const worker = new Worker(file, {
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  })
  const client = Rpc.client<typeof rpc>(worker)
  const reload = () => {
    client.call("reload", undefined).catch(() => {})
  }
  process.on("SIGUSR2", reload)

  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    process.off("SIGUSR2", reload)
    try { unguard?.() } catch {}
    await withTimeout(client.call("shutdown", undefined), 5000).catch(() => {})
    worker.terminate()
  }
  const prompt = await readPrompt(args.prompt)
  const config = await TuiConfig.get()

  const network = resolveNetworkOptionsNoConfig(args)
  const external = hasArg("--port") || hasArg("--hostname") || network.mdns === true
  const headers = external ? ServerAuth.headers() : undefined

  const transport = external
    ? {
        url: (await client.call("server", network)).url,
        fetch: undefined,
        events: undefined,
        headers,
      }
    : {
        url: "http://opencode.internal",
        fetch: createWorkerFetch(client),
        events: createEventSource(client),
      }

  try {
    await validateSession({
      url: transport.url,
      sessionID: args.session,
      directory: cwd,
      fetch: transport.fetch,
      headers,
    })
  } catch (error) {
    UI.error(errorMessage(error))
    process.exitCode = 1
    await stop()
    throw error
  }

  return {
    url: transport.url,
    fetch: transport.fetch,
    events: transport.events,
    headers: transport.headers,
    config,
    directory: cwd,
    pluginHost: createLegacyTuiPluginHost(),
    args: {
      continue: args.continue,
      sessionID: args.session,
      agent: args.agent,
      model: args.model,
      prompt,
      fork: args.fork,
      auto: args.auto || args.yolo || args["dangerously-skip-permissions"] || false,
    },
    onSnapshot: async () => {
      const tui = writeHeapSnapshot("tui.heapsnapshot")
      const server = await client.call("snapshot", undefined)
      return [tui, server]
    },
    stop,
  }
}