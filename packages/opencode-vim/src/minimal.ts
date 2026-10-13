import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs"
import { applyMinimalModeDefaults } from "./runtime"
import { MODEL_FREE_ONLY_ENV } from "./config/model-filter"

type MinimalArgs = {
  free?: boolean
  [key: string]: unknown
}

export const MinimalCommand: CommandModule<object, MinimalArgs> = {
  command: "$0 [project]",
  describe: "start opencode vim tui",
  builder: ((yargs: Argv) => {
    return yargs.option("free", {
      type: "boolean",
      describe: "only show free models and force the default model to a free model",
      default: false,
    })
  }) as NonNullable<CommandModule<object, MinimalArgs>["builder"]>,
  handler: async (args: ArgumentsCamelCase<MinimalArgs>) => {
    applyMinimalModeDefaults()
    if (args.free) process.env[MODEL_FREE_ONLY_ENV] = "1"
  },
}
