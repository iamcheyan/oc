import * as Sdk from "@opencode-ai/sdk/v2"
import { patchConfigProvidersClient } from "./patch-config-providers"

const original = Sdk.createOpencodeClient
const patchedSdk = Sdk as typeof Sdk & {
  createOpencodeClient: typeof Sdk.createOpencodeClient
}

patchedSdk.createOpencodeClient = ((...args: Parameters<typeof original>) =>
  patchConfigProvidersClient(original(...args))) as typeof original