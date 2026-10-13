import { createEffect } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useData } from "@tui/context/data"
import { useLocation } from "@tui/context/location"
import { findFreeModel, isForcedFreeOnly, isModelFree } from "@/config/model-filter"

export function ModelFreeGuard() {
  const local = useLocal()
  const data = useData()
  const location = useLocation()

  const models = () => data.location.model.list(location.ref)
  const providers = () =>
    (data.location.provider.list(location.ref) ?? []).map((provider) => ({
      id: provider.id,
      models: Object.fromEntries(
        (data.location.model.list(location.ref) ?? [])
          .filter((model) => model.providerID === provider.id)
          .map((model) => [model.modelID, model]),
      ),
    }))

  createEffect(() => {
    if (!local.model.ready) return
    if (!isForcedFreeOnly()) return
    if (isModelFree(models(), local.model.current())) return
    const model = findFreeModel(providers())
    if (!model) return
    local.model.set(model, { recent: true })
  })

  return null
}
