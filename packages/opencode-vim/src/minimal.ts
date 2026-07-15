import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs"
import { TuiThreadCommand } from "@/upstream/thread"
import { applyMinimalModeDefaults } from "./runtime"
import { installMinimalRootComponents } from "./root-components"
import { MODEL_FREE_ONLY_ENV } from "./config/model-filter"

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

    if (typeof TuiThreadCommand.handler === "function") {
      await TuiThreadCommand.handler(args as never)
    }
  },
}
