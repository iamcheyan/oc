import { createMemo, createSignal } from "solid-js"
import { useData } from "../../../tui/src/context/data"
import { useLocation } from "../../../tui/src/context/location"
import { useLocal } from "../../../tui/src/context/local"
import { useRoute } from "../../../tui/src/context/route"
import { useClient } from "../../../tui/src/context/client"
import { useDialog } from "../../../tui/src/ui/dialog"
import { DialogSelect } from "../../../tui/src/ui/dialog-select"
import { DialogVariant } from "../../../tui/src/component/dialog-variant"
import { DialogIntegration } from "../../../tui/src/component/dialog-integration"
import { Keymap } from "../../../tui/src/context/keymap"
import { isForcedFreeOnly, isFreeOpenCodeModel } from "../config/model-filter"

type ModelValue = { providerID: string; modelID: string }

export function DialogForkModel() {
  const local = useLocal()
  const data = useData()
  const location = useLocation()
  const route = useRoute()
  const client = useClient()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")
  const freeOnly = createMemo(() => isForcedFreeOnly())
  const models = createMemo(() => data.location.model.list(location.ref) ?? [])
  const providers = createMemo(() => new Map((data.location.provider.list(location.ref) ?? []).map((provider) => [provider.id, provider])))
  const options = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const favorites = local.model.favorite()
    const recents = local.model.recent()

    const allModels = models()
      .filter((model) => model.status !== "deprecated")
      .filter((model) => !freeOnly() || isFreeOpenCodeModel({ id: model.providerID }, model))

    const toOption = (providerID: string, modelID: string, category: string, isFav: boolean) => {
      const model = allModels.find((m) => m.providerID === providerID && m.id === modelID)
      if (!model) return null
      const provider = providers().get(model.providerID)
      return {
        value: { providerID: model.providerID, modelID: model.id },
        title: model.name,
        description: isFav ? "(Favorite)" : provider?.name ?? model.providerID,
        category,
        disabled: model.providerID === "opencode" && model.id.includes("-nano"),
        footer: isFreeOpenCodeModel({ id: model.providerID }, model) ? "Free" : undefined,
        releaseDate: model.time.released,
        onSelect() { onSelect(model.providerID, model.id) },
      }
    }

    const sections: ReturnType<typeof toOption>[] = []
    if (!needle) {
      for (const item of favorites) {
        const opt = toOption(item.providerID, item.modelID, "Favorites", true)
        if (opt) sections.push(opt)
      }
      for (const item of recents) {
        if (favorites.some((f) => f.providerID === item.providerID && f.modelID === item.modelID)) continue
        const opt = toOption(item.providerID, item.modelID, "Recent", false)
        if (opt) sections.push(opt)
      }
    }

    const catalogOptions = allModels
      .map((model) => {
        const provider = providers().get(model.providerID)
        const favorite = favorites.some((item) => item.providerID === model.providerID && item.modelID === model.id)
        return {
          value: { providerID: model.providerID, modelID: model.id },
          title: model.name,
          description: favorite ? "(Favorite)" : undefined,
          category: provider?.name ?? model.providerID,
          disabled: model.providerID === "opencode" && model.id.includes("-nano"),
          footer: isFreeOpenCodeModel({ id: model.providerID }, model) ? "Free" : undefined,
          releaseDate: model.time.released,
          onSelect() { onSelect(model.providerID, model.id) },
        }
      })
      .filter((option) => !needle || option.title.toLowerCase().includes(needle) || option.category.toLowerCase().includes(needle) || option.value.modelID.toLowerCase().includes(needle) || option.value.providerID.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.footer === "Free") - Number(a.footer === "Free") || Number(b.releaseDate) - Number(a.releaseDate) || a.title.localeCompare(b.title))

    return [...(sections.filter(Boolean) as NonNullable<ReturnType<typeof toOption>>[]), ...catalogOptions]
  })
  function onSelect(providerID: string, modelID: string) {
    local.model.set({ providerID, modelID }, { recent: true })
    if (route.data.type === "session") {
      const sessionID = route.data.sessionID
      const current = local.agent.current()
      if (current) {
        local.model.trackSessionCommit(sessionID, { providerID, id: modelID }, current.id)
      }
      void client.api.session.switchModel({
        sessionID,
        model: { providerID, id: modelID, variant: local.model.variant.current() },
      }).catch(() => {})
    }
    const variants = local.model.variant.list()
    const current = local.model.variant.current()
    if (current === "default" || (current && variants.includes(current))) return dialog.clear()
    if (variants.length) return dialog.replace(() => <DialogVariant />)
    dialog.clear()
  }
  return <DialogSelect<ModelValue> options={options()} actions={[{ command: "model.dialog.provider", title: "Connect provider", selection: "none", onTrigger: () => dialog.replace(() => <DialogIntegration onConnected={() => dialog.replace(() => <DialogForkModel />)} />) }, { command: "model.dialog.favorite", title: "Favorite", onTrigger: (option) => local.model.toggleFavorite(option.value) }]} onFilter={setQuery} flat skipFilter title={freeOnly() ? "Select free model" : "Select model"} current={local.model.current()} emptyView={<box><text>No {freeOnly() ? "free " : ""}models found</text></box>} />
}

export function ForkModelCommand() {
  const dialog = useDialog()
  Keymap.createLayer(() => ({
    mode: "global",
    commands: [
      {
        id: "model.list",
        title: "Switch model",
        group: "Agent",
        palette: true,
        suggested: true,
        slash: { name: "models", aliases: ["mo"] },
        run: () => dialog.replace(() => <DialogForkModel />),
      },
    ],
  }))
  return null
}
