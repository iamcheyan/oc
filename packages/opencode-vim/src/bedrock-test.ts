import { runBedrockScanner } from "../../bedrock-scanner/src/index"
import type { Argv, CommandModule } from "yargs"

export const BedrockTestCommand: CommandModule = {
  command: "bedrock-test",
  describe: "test AWS Bedrock model availability and save CLI config",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    await runBedrockScanner()
  },
}
