import "./sdk/install-patches"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import "@opencode-ai/core/global"
import { MinimalCommand } from "./minimal"
import { BedrockTestCommand } from "./bedrock-test"
import { applyMinimalModeDefaults } from "./runtime"
import { CliCommand } from "./cli"
import { ModelSelectCommand } from "./model-select"

const isBedrockTest = process.argv.includes("bedrock-test")
if (!isBedrockTest) {
  applyMinimalModeDefaults()
  if (process.argv.includes("--print-logs")) process.env.OPENCODE_PRINT_LOGS = "1"
  process.env.OPENCODE_LOG_LEVEL = process.env.OPENCODE_MINIMAL_LOG_LEVEL === "ERROR" ? "ERROR" : "WARN"
}

yargs(hideBin(process.argv))
  .scriptName("opencode-vim")
  .command(MinimalCommand)
  .command(CliCommand)
  .command(ModelSelectCommand)
  .command(BedrockTestCommand)
  .help()
  .parse()
