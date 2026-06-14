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
}

yargs(hideBin(process.argv))
  .scriptName("opencode-vim")
  .command(MinimalCommand)
  .command(CliCommand)
  .command(ModelSelectCommand)
  .command(BedrockTestCommand)
  .help()
  .parse()
