import { createMemo, createSignal } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogVariant } from "@tui/component/dialog-variant"
import { DialogProvider } from "@tui/component/dialog-provider"
import { isForcedFreeOnly, isFreeOpenCodeModel } from "@/config/model-filter"
import { useBindings } from "@tui/keymap"

type ModelValue = {
  providerID: string
  modelID: string
}

export function DialogForkModel() {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")

  const freeOnly = createMemo(() => isForcedFreeOnly())
  const favorites = createMemo(() => local.model.favorite())
  const options = createMemo(() => {
    const needle = query().trim().toLowerCase()
    return sync.data.provider
      .flatMap((provider) =>
        Object.entries(provider.models)
          .filter(([, model]) => model.status !== "deprecated")
          .filter(([, model]) => !freeOnly() || isFreeOpenCodeModel(provider, model))
          .map(([modelID, model]) => ({
            value: { providerID: provider.id, modelID },
            title: model.name ?? modelID,
            description: favorites().some((item) => item.providerID === provider.id && item.modelID === modelID)
              ? "(Favorite)"
              : undefined,
            category: provider.name ?? provider.id,
            disabled: provider.id === "opencode" && modelID.includes("-nano"),
            footer: isFreeOpenCodeModel(provider, model) ? "Free" : undefined,
            releaseDate: model.release_date,
            onSelect() {
              onSelect(provider.id, modelID)
            },
          })),
      )
      .filter((option) => {
        if (!needle) return true
        return (
          option.title.toLowerCase().includes(needle) ||
          option.category.toLowerCase().includes(needle) ||
          option.value.modelID.toLowerCase().includes(needle) ||
          option.value.providerID.toLowerCase().includes(needle)
        )
      })
      .sort((left, right) => {
        if (left.footer === "Free" && right.footer !== "Free") return -1
        if (left.footer !== "Free" && right.footer === "Free") return 1
        return String(right.releaseDate).localeCompare(String(left.releaseDate)) || left.title.localeCompare(right.title)
      })
  })

  function onSelect(providerID: string, modelID: string) {
    local.model.set({ providerID, modelID }, { recent: true })
    const list = local.model.variant.list()
    const cur = local.model.variant.selected()
    if (cur === "default" || (cur && list.includes(cur))) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  return (
    <DialogSelect<ModelValue>
      options={options()}
      actions={[
        {
          command: "model.dialog.provider",
          title: "Connect provider",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          command: "model.dialog.favorite",
          title: "Favorite",
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value)
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title={freeOnly() ? "Select free model" : "Select model"}
      current={local.model.current()}
      emptyView={
        <box>
          <text>No {freeOnly() ? "free " : ""}models found</text>
        </box>
      }
    />
  )
}

export function ForkModelCommand() {
  const dialog = useDialog()

  useBindings(() => ({
    commands: [
      {
        namespace: "palette",
        name: "model.list",
        title: "Switch model",
        suggested: true,
        category: "Agent",
        slashName: "models",
        slashAliases: ["mo"],
        run: () => {
          dialog.replace(() => <DialogForkModel />)
        },
      },
    ],
  }))

  return null
}
