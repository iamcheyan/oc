import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import { applyConfigModelDefaultToProvidersResponse } from "@/util/config-model-default"

const patchedClients = new WeakSet<OpencodeClient>()

export function patchConfigProvidersClient(client: OpencodeClient): OpencodeClient {
  if (patchedClients.has(client)) return client

  const providers = client.config.providers.bind(client.config)

  client.config.providers = (async (...args: Parameters<typeof providers>) => {
    const [response, config] = await Promise.all([providers(...args), client.config.get(...args)])

    if (!response.data) return response

    return {
      ...response,
      data: applyConfigModelDefaultToProvidersResponse(response.data, config.data?.model),
    }
  }) as typeof client.config.providers

  patchedClients.add(client)
  return client
}