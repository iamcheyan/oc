import { createSignal, createMemo, Show, For, onMount } from "solid-js"
import { useBindings } from "@tui/keymap"
import { useSync } from "@tui/context/sync"
import { useForkTheme } from "@/util/theme"
import { RGBA, TextAttributes } from "@opentui/core"
import {
  loadQuickModelConfig,
  saveQuickModelConfig,
  formatSlotModel,
  type QuickModelConfig,
} from "@/config/quick-model"

const MAX_VISIBLE = 10
const SLOTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

export function DialogQuickModel(props: { dialog: any; directory: string }) {
  const { theme } = useForkTheme()
  const sync = useSync()

  const [config, setConfig] = createSignal<QuickModelConfig>(loadQuickModelConfig(props.directory))
  const [selectedSlot, setSelectedSlot] = createSignal(0)
  // "browse" mode: searching models to assign to the selected slot
  const [browse, setBrowse] = createSignal(false)
  const [search, setSearch] = createSignal("")
  const [modelIndex, setModelIndex] = createSignal(0)
  const [status, setStatus] = createSignal<"idle" | "saved">("idle")
  let searchInput: any

  const allModels = createMemo(() => {
    const providers = sync.data.provider
    const result: { key: string; label: string; provider: string; name: string }[] = []
    for (const provider of providers) {
      for (const modelID of Object.keys(provider.models)) {
        const info = provider.models[modelID]
        result.push({
          key: `${provider.id}/${modelID}`,
          label: `${provider.id}/${modelID}`,
          provider: provider.name ?? provider.id,
          name: (info as any)?.name ?? modelID,
        })
      }
    }
    return result
  })

  // Filter models by search query across label, provider name, and model name
  const filteredModels = createMemo(() => {
    const q = search().toLowerCase().trim()
    if (!q) return allModels()
    return allModels().filter((m) =>
      m.label.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q),
    )
  })

  const visibleModels = createMemo(() => filteredModels().slice(0, MAX_VISIBLE))

  onMount(() => {
    props.dialog.setSize("medium")
  })

  function assignModel(modelKey: string) {
    const slot = SLOTS[selectedSlot()]
    setConfig((c) => ({ slots: { ...c.slots, [slot]: modelKey } }))
  }

  // Slot view bindings
  useBindings(() => ({
    enabled: !browse(),
    bindings: [
      { key: "escape", desc: "Close", group: "Dialog", cmd: () => props.dialog.clear() },
      { key: "up", desc: "Previous slot", group: "Dialog", cmd: () => { setSelectedSlot((i) => Math.max(0, i - 1)); return true } },
      { key: "k", desc: "Previous slot", group: "Dialog", cmd: () => { setSelectedSlot((i) => Math.max(0, i - 1)); return true } },
      { key: "down", desc: "Next slot", group: "Dialog", cmd: () => { setSelectedSlot((i) => Math.min(8, i + 1)); return true } },
      { key: "j", desc: "Next slot", group: "Dialog", cmd: () => { setSelectedSlot((i) => Math.min(8, i + 1)); return true } },
      {
        key: "enter", desc: "Browse models", group: "Dialog", cmd: () => {
          setBrowse(true)
          setSearch("")
          setModelIndex(0)
          setTimeout(() => searchInput?.focus(), 1)
        },
      },
      {
        key: "d", desc: "Clear slot", group: "Dialog", cmd: () => {
          const slot = SLOTS[selectedSlot()]
          setConfig((c) => ({ slots: { ...c.slots, [slot]: "" } }))
        },
      },
          {
            key: "s", desc: "Save and close", group: "Dialog", cmd: async () => {
              saveQuickModelConfig(props.directory, config())
              setStatus("saved")
              setTimeout(() => props.dialog.clear(), 600)
            },
          },
          {
            key: "q", desc: "Close without saving", group: "Dialog", cmd: () => props.dialog.clear(),
          },
    ],
  }))

  // Model browse bindings (search active)
  useBindings(() => ({
    enabled: browse(),
    bindings: [
      {
        key: "escape", desc: "Back to slots", group: "Dialog", cmd: () => {
          setBrowse(false)
          setSearch("")
          setModelIndex(0)
        },
      },
      { key: "up", desc: "Previous model", group: "Dialog", cmd: () => { setModelIndex((i) => Math.max(0, i - 1)); return true } },
      { key: "k", desc: "Previous model", group: "Dialog", cmd: () => { setModelIndex((i) => Math.max(0, i - 1)); return true } },
      { key: "down", desc: "Next model", group: "Dialog", cmd: () => { setModelIndex((i) => Math.min(visibleModels().length - 1, i + 1)); return true } },
      { key: "j", desc: "Next model", group: "Dialog", cmd: () => { setModelIndex((i) => Math.min(visibleModels().length - 1, i + 1)); return true } },
      {
        key: "tab", desc: "Clear slot", group: "Dialog", cmd: () => {
          const slot = SLOTS[selectedSlot()]
          setConfig((c) => ({ slots: { ...c.slots, [slot]: "" } }))
          setBrowse(false)
          setSearch("")
          setModelIndex(0)
        },
      },
      {
        key: "enter", desc: "Assign model", group: "Dialog", cmd: () => {
          const models = visibleModels()
          if (models.length === 0) return
          const idx = Math.min(modelIndex(), models.length - 1)
          assignModel(models[idx].key)
          setBrowse(false)
          setSearch("")
          setModelIndex(0)
          // Auto-advance to next slot for fast sequential configuration
          setSelectedSlot((i) => Math.min(8, i + 1))
        },
      },
    ],
  }))

  const borderColor = () => status() === "saved" ? RGBA.fromInts(0, 200, 100, 255) : RGBA.fromInts(120, 120, 120, 255)

  return (
    <box
      border={["top", "bottom", "left", "right"]}
      borderColor={borderColor()}
      height={browse() ? 20 : 20}
      alignItems="flex-start"
      backgroundColor={theme.backgroundPanel}
      padding={1}
    >
      <box width="100%" alignItems="center" justifyContent="center" marginBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Quick Model Slots
        </text>
      </box>

      <Show when={!browse()}>
        <box width="100%" marginBottom={1}>
          <text fg={theme.textMuted} attributes={TextAttributes.UNDERLINE}>
            {"Key  Model"}
          </text>
        </box>
        <box width="100%" flexDirection="column">
          <For each={SLOTS}>
            {(slot, i) => {
              const modelStr = config().slots[slot] || ""
              const display = modelStr ? formatSlotModel(modelStr) : "(not set)"
              const isSelected = createMemo(() => selectedSlot() === i())
              return (
                <box
                  width="100%" flexDirection="row"
                  backgroundColor={isSelected() ? RGBA.fromInts(40, 40, 60, 255) : undefined}
                >
                  <text
                    width={4}
                    fg={isSelected() ? RGBA.fromInts(255, 200, 0, 255) : theme.warning}
                    attributes={isSelected() ? TextAttributes.BOLD : undefined}
                  >
                    {slot}
                  </text>
                  <text
                    fg={modelStr ? theme.text : theme.textMuted}
                    wrapMode="none"
                  >
                    {display}
                  </text>
                </box>
              )
            }}
          </For>
        </box>
        <box width="100%" flexDirection="row" marginTop={1}>
          <text fg={theme.textMuted}>
            [↑↓] select  [Enter] browse  [d] clear  [s] save  [Esc] close
          </text>
        </box>
      </Show>

      <Show when={browse()}>
        <box width="100%" marginBottom={1}>
          <text fg={theme.textMuted}>Slot </text>
          <text fg={theme.warning} attributes={TextAttributes.BOLD}>
            {SLOTS[selectedSlot()]}
          </text>
          <text fg={theme.textMuted}> — Search: </text>
          <input
            ref={(r: any) => { searchInput = r }}
            value={search()}
            onInput={(val: string) => { setSearch(val); setModelIndex(0) }}
            onSubmit={() => {
              const models = visibleModels()
              if (models.length === 0) return
              const idx = Math.min(modelIndex(), models.length - 1)
              assignModel(models[idx].key)
              setBrowse(false)
              setSearch("")
              setModelIndex(0)
              setSelectedSlot((i) => Math.min(8, i + 1))
            }}
            focusedBackgroundColor={RGBA.fromInts(30, 30, 30, 255)}
            focusedTextColor={RGBA.fromInts(255, 255, 255, 255)}
            cursorColor={RGBA.fromInts(255, 200, 0, 255)}
            placeholder="type to filter models..."
            placeholderColor={theme.textMuted}
          />
        </box>
        <box width="100%" flexDirection="column" height={MAX_VISIBLE + 1}>
          <Show when={visibleModels().length === 0}>
            <text fg={theme.textMuted}>
              No models match "{search()}"
            </text>
          </Show>
          <For each={visibleModels()}>
            {(model, i) => (
              <box
                width="100%" flexDirection="row"
                backgroundColor={modelIndex() === i() ? RGBA.fromInts(40, 40, 60, 255) : undefined}
              >
                <text
                  fg={modelIndex() === i() ? RGBA.fromInts(255, 200, 0, 255) : theme.text}
                  attributes={modelIndex() === i() ? TextAttributes.BOLD : undefined}
                >
                  {modelIndex() === i() ? "❯ " : "  "}
                  {model.label}
                </text>
              </box>
            )}
          </For>
        </box>
        <box width="100%" marginTop={1}>
          <text fg={theme.textMuted}>
            [type] filter  [↑↓] select  [Enter] assign+next  [Tab] clear  [Esc] back
          </text>
        </box>
      </Show>

      <Show when={status() === "saved"}>
        <box width="100%" alignItems="center" marginTop={1}>
          <text fg={RGBA.fromInts(0, 200, 100, 255)} attributes={TextAttributes.BOLD}>
            Saved!
          </text>
        </box>
      </Show>
    </box>
  )
}
