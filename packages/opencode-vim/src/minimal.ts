import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs"
import { Effect } from "effect"
import { TuiThreadCommand } from "@/upstream/thread"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { applyMinimalModeDefaults } from "./runtime"
import { installMinimalRootComponents } from "./root-components"
import { MODEL_FREE_ONLY_ENV } from "./config/model-filter"
import { createThreadTransport } from "./thread-transport"
import { runVimTui } from "./run"

type MinimalArgs = {
  free?: boolean
  [key: string]: unknown
}

export const MinimalCommand: CommandModule<object, MinimalArgs> = {
  command: "$0 [project]",
  describe: "start opencode vim tui",
  builder: ((yargs: Argv) => {
    const next = yargs.option("free", {
      type: "boolean",
      describe: "only show free models and force the default model to a free model",
      default: false,
    })
    if (typeof TuiThreadCommand.builder === "function") {
      return TuiThreadCommand.builder(next) as Argv<MinimalArgs>
    }
    return next
  }) as NonNullable<CommandModule<object, MinimalArgs>["builder"]>,
  handler: async (args: ArgumentsCamelCase<MinimalArgs>) => {
    applyMinimalModeDefaults()
    if (args.free) process.env[MODEL_FREE_ONLY_ENV] = "1"
    installMinimalRootComponents()

    const transport = await createThreadTransport(args as never)
    try {
      await Effect.runPromise(
        runVimTui({
          url: transport.url,
          args: transport.args,
          config: transport.config,
          onSnapshot: transport.onSnapshot,
          directory: transport.directory,
          fetch: transport.fetch,
          headers: transport.headers,
          events: transport.events,
          pluginHost: transport.pluginHost,
        }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
      )
    } finally {
      await transport.stop()
    }
    process.exit(0)
  },
}