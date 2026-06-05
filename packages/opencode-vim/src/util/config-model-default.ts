import type { Provider } from "@opencode-ai/sdk/v2"

export type ConfigModelRef = {
  providerID: string
  modelID: string
}

export function parseConfigModel(model: string | undefined): ConfigModelRef | undefined {
  if (!model) return undefined
  const [providerID, ...rest] = model.split("/")
  const modelID = rest.join("/")
  if (!providerID || !modelID) return undefined
  return { providerID, modelID }
}

export function providerDefaultFromConfigModel(
  configModel: string | undefined,
  upstreamDefault: Record<string, string> = {},
): Record<string, string> {
  const parsed = parseConfigModel(configModel)
  if (!parsed) return upstreamDefault
  return { [parsed.providerID]: parsed.modelID }
}

export function applyConfigModelDefaultToProvidersResponse<
  T extends { default: Record<string, string>; providers: Provider[] },
>(response: T, configModel: string | undefined): T {
  const parsed = parseConfigModel(configModel)
  if (!parsed) return response
  const defaults: Record<string, string> = { [parsed.providerID]: parsed.modelID }
  return {
    ...response,
    default: defaults,
  }
}