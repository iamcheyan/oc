import { createEffect } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { findFreeModel, isForcedFreeOnly, isModelFree } from "@/config/model-filter"

export function ModelFreeGuard() {
  const local = useLocal()
  const sync = useSync()

  createEffect(() => {
    if (!sync.ready || !local.model.ready) return
    if (!isForcedFreeOnly()) return
    if (isModelFree(sync.data.provider, local.model.current())) return
    const model = findFreeModel(sync.data.provider)
    if (!model) return
    local.model.set(model, { recent: true })
  })

  return null
}
