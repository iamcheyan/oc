export const MODEL_FREE_ONLY_ENV = "OPENCODE_VIM_FREE_ONLY"

type ModelCost =
  | {
      input?: number
      output?: number
    }
  | {
      input?: number
      output?: number
    }[]

type ProviderModel = {
  cost?: ModelCost
  status?: string
}

export function isFreeOpenCodeModel(provider: { id: string }, model: ProviderModel) {
  if (provider.id !== "opencode") return false
  if (!model.cost) return false
  if (Array.isArray(model.cost)) {
    return model.cost.length > 0 && model.cost.every((item) => (item.input ?? 0) === 0 && (item.output ?? 0) === 0)
  }
  return (model.cost.input ?? 0) === 0 && (model.cost.output ?? 0) === 0
}

export function isForcedFreeOnly() {
  return process.env[MODEL_FREE_ONLY_ENV] === "1"
}

export function findFreeModel(
  providers: {
    id: string
    models: Record<string, ProviderModel>
  }[],
) {
  return providers.flatMap((provider) =>
    Object.entries(provider.models)
      .filter(([, model]) => model.status !== "deprecated")
      .filter(([, model]) => isFreeOpenCodeModel(provider, model))
      .map(([modelID]) => ({ providerID: provider.id, modelID })),
  )[0]
}

export function isModelFree(
  providers: {
    id: string
    models: Record<string, ProviderModel>
  }[],
  model: { providerID: string; modelID: string } | undefined,
) {
  if (!model) return false
  const provider = providers.find((item) => item.id === model.providerID)
  const info = provider?.models[model.modelID]
  if (!provider || !info) return false
  return isFreeOpenCodeModel(provider, info)
}
