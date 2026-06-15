import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs"
import { TuiThreadCommand } from "@/upstream/thread"
import { applyMinimalModeDefaults } from "./runtime"
import { installMinimalRootComponents } from "./root-components"

type MinimalArgs = {
  [key: string]: unknown
}

export const MinimalCommand: CommandModule<object, MinimalArgs> = {
  command: "$0 [project]",
  describe: "start opencode vim tui",
  builder: ((yargs: Argv) => {
    if (typeof TuiThreadCommand.builder === "function") {
      return TuiThreadCommand.builder(yargs) as Argv<MinimalArgs>
    }
    return yargs
  }) as NonNullable<CommandModule<object, MinimalArgs>["builder"]>,
  handler: async (args: ArgumentsCamelCase<MinimalArgs>) => {
    applyMinimalModeDefaults()
    installMinimalRootComponents()

    if (typeof TuiThreadCommand.handler === "function") {
      await TuiThreadCommand.handler(args as never)
    }
  },
}
