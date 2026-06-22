import { createSignal, createMemo, Show, For, onMount } from "solid-js"
import { useBindings } from "@tui/keymap"
import { useSync } from "@tui/context/sync"
import { useForkTheme } from "@/util/theme"
import { TextAttributes, RGBA } from "@opentui/core"
import {
  loadRoutingConfig,
  saveRoutingConfig,
  ROUTING_AGENTS,
  type RoutingConfig,
  type RoutingAgentEntry,
} from "@/config/routing"

const WHITE_BOX_BORDER = {
  topLeft: "┌",
  bottomLeft: "└",
  vertical: "│",
  topRight: "┐",
  bottomRight: "┘",
  horizontal: "─",
  bottomT: "┴",
  topT: "┬",
  cross: "┼",
  leftT: "├",
  rightT: "┤",
}

const MAX_VISIBLE_MODELS = 7

export function DialogRouting(props: { dialog: any; directory: string }) {
  const { theme } = useForkTheme()
  const sync = useSync()

  const [config, setConfig] = createSignal<RoutingConfig>(loadRoutingConfig(props.directory))
  const [selectedRow, setSelectedRow] = createSignal(0)
  const [editingModel, setEditingModel] = createSignal(false)
  const [modelSearch, setModelSearch] = createSignal("")
  const [modelSelectedIndex, setModelSelectedIndex] = createSignal(0)
  const [status, setStatus] = createSignal<"idle" | "saving" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = createSignal("")

  const allModels = createMemo(() => {
    const providers = sync.data.provider
    const result: { providerID: string; modelID: string; label: string }[] = []
    for (const provider of providers) {
      for (const modelID of Object.keys(provider.models)) {
        result.push({
          providerID: provider.id,
          modelID,
          label: `${provider.id}/${modelID}`,
        })
      }
    }
    return result
  })

  const filteredModels = createMemo(() => {
    const search = modelSearch().toLowerCase().trim()
    if (!search) return allModels()
    return allModels().filter((m) => m.label.toLowerCase().includes(search))
  })

  const visibleModels = createMemo(() => filteredModels().slice(0, MAX_VISIBLE_MODELS))

  onMount(() => {
    props.dialog.setSize("medium")
  })

  function getAgentEntry(key: string): RoutingAgentEntry {
    return config().agents[key] ?? { agent: key }
  }

  function updateAgentModel(key: string, model: string) {
    setConfig((c) => ({
      ...c,
      agents: {
        ...c.agents,
        [key]: { ...getAgentEntry(key), model },
      },
    }))
  }

  function clearAgentModel(key: string) {
    setConfig((c) => {
      const agents = { ...c.agents }
      const entry = agents[key]
      if (entry) {
        agents[key] = { agent: entry.agent }
      }
      return { ...c, agents }
    })
  }

  useBindings(() => ({
    enabled: !editingModel(),
    bindings: [
      {
        key: "escape",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
      {
        key: "tab",
        desc: "Toggle routing on/off",
        group: "Dialog",
        cmd: () => {
          setConfig((c) => ({ ...c, enabled: !c.enabled }))
        },
      },
      {
        key: "up",
        desc: "Previous agent",
        group: "Dialog",
        cmd: () => {
          setSelectedRow((i) => Math.max(0, i - 1))
          return true
        },
      },
      {
        key: "k",
        desc: "Previous agent",
        group: "Dialog",
        cmd: () => {
          setSelectedRow((i) => Math.max(0, i - 1))
          return true
        },
      },
      {
        key: "down",
        desc: "Next agent",
        group: "Dialog",
        cmd: () => {
          setSelectedRow((i) => Math.min(ROUTING_AGENTS.length - 1, i + 1))
          return true
        },
      },
      {
        key: "j",
        desc: "Next agent",
        group: "Dialog",
        cmd: () => {
          setSelectedRow((i) => Math.min(ROUTING_AGENTS.length - 1, i + 1))
          return true
        },
      },
      {
        key: "enter",
        desc: "Change model",
        group: "Dialog",
        cmd: () => {
          setEditingModel(true)
          setModelSearch("")
          setModelSelectedIndex(0)
        },
      },
      {
        key: "s",
        desc: "Save to file",
        group: "Dialog",
        cmd: () => {
          saveAndClose()
        },
      },
      {
        key: "d",
        desc: "Clear model assignment",
        group: "Dialog",
        cmd: () => {
          const agentKey = ROUTING_AGENTS[selectedRow()].key
          clearAgentModel(agentKey)
        },
      },
    ],
  }))

  useBindings(() => ({
    enabled: editingModel(),
    bindings: [
      {
        key: "escape",
        desc: "Cancel model selection",
        group: "Dialog",
        cmd: () => {
          setEditingModel(false)
          setModelSearch("")
          setModelSelectedIndex(0)
        },
      },
      {
        key: "up",
        desc: "Previous model",
        group: "Dialog",
        cmd: () => {
          const len = visibleModels().length
          if (len === 0) return
          setModelSelectedIndex((i) => (i - 1 + len) % len)
          return true
        },
      },
      {
        key: "k",
        desc: "Previous model",
        group: "Dialog",
        cmd: () => {
          const len = visibleModels().length
          if (len === 0) return
          setModelSelectedIndex((i) => (i - 1 + len) % len)
          return true
        },
      },
      {
        key: "down",
        desc: "Next model",
        group: "Dialog",
        cmd: () => {
          const len = visibleModels().length
          if (len === 0) return
          setModelSelectedIndex((i) => (i + 1) % len)
          return true
        },
      },
      {
        key: "j",
        desc: "Next model",
        group: "Dialog",
        cmd: () => {
          const len = visibleModels().length
          if (len === 0) return
          setModelSelectedIndex((i) => (i + 1) % len)
          return true
        },
      },
      {
        key: "tab",
        desc: "Clear assignment and close",
        group: "Dialog",
        cmd: () => {
          const agentKey = ROUTING_AGENTS[selectedRow()].key
          clearAgentModel(agentKey)
          setEditingModel(false)
          setModelSearch("")
          setModelSelectedIndex(0)
        },
      },
    ],
  }))

  function selectModel() {
    const models = visibleModels()
    if (models.length === 0) return
    const selected = models[modelSelectedIndex()] ?? models[0]
    const agentKey = ROUTING_AGENTS[selectedRow()].key
    const modelStr = `${selected.providerID}/${selected.modelID}`
    updateAgentModel(agentKey, modelStr)
    setEditingModel(false)
    setModelSearch("")
    setModelSelectedIndex(0)
  }

  /**
   * Save routing config to .opencode/mina-routing.jsonc and close dialog.
   * Does NOT call sdk.client.config.update — the plugin reads the file directly.
   */
  function saveAndClose() {
    setStatus("saving")
    setErrorMsg("")
    try {
      saveRoutingConfig(props.directory, config())
      setStatus("saved")
      setTimeout(() => {
        props.dialog.clear()
      }, 800)
    } catch (e: any) {
      setErrorMsg(e?.message || String(e))
      setStatus("error")
    }
  }

  const enabledColor = createMemo(() =>
    config().enabled ? RGBA.fromInts(0, 200, 100, 255) : RGBA.fromInts(120, 120, 120, 255),
  )

  const borderColor = createMemo(() => {
    if (status() === "saved") return RGBA.fromInts(0, 200, 100, 255)
    if (status() === "error") return RGBA.fromInts(250, 80, 80, 255)
    if (config().enabled) return RGBA.fromInts(100, 180, 255, 255)
    return RGBA.fromInts(120, 120, 120, 255)
  })

  return (
    <box
      border={["top", "bottom", "left", "right"]}
      borderColor={borderColor()}
      customBorderChars={WHITE_BOX_BORDER}
      height={editingModel() ? 22 : 18}
      alignItems="flex-start"
      backgroundColor={theme.backgroundPanel}
      padding={1}
    >
      <box width="100%" alignItems="center" justifyContent="center" marginBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Agent Model Routing
        </text>
      </box>

      <box width="100%" flexDirection="row" alignItems="center" marginBottom={1}>
        <text fg={enabledColor()} attributes={TextAttributes.BOLD}>
          {config().enabled ? "[●]" : "[ ]"}
        </text>
        <text fg={theme.text} marginLeft={1}>
          Routing {config().enabled ? "ON" : "OFF"}
        </text>
        <text fg={theme.textMuted} marginLeft={2}>
          [Tab] toggle
        </text>
      </box>

      <Show when={!editingModel()}>
        <box width="100%" marginBottom={1}>
          <text fg={theme.textMuted} attributes={TextAttributes.UNDERLINE}>
            {"Role           Agent          Model"}
          </text>
        </box>
        <box width="100%" flexDirection="column">
          <For each={ROUTING_AGENTS}>
            {(agentDef, i) => {
              const entry = createMemo(() => getAgentEntry(agentDef.key))
              const modelDisplay = createMemo(() => entry().model || "(default)")
              const isSelected = createMemo(() => selectedRow() === i())
              return (
                <box width="100%" flexDirection="row" backgroundColor={isSelected() ? RGBA.fromInts(40, 40, 60, 255) : undefined}>
                  <text
                    width={14}
                    fg={isSelected() ? RGBA.fromInts(255, 200, 0, 255) : theme.text}
                    attributes={isSelected() ? TextAttributes.BOLD : undefined}
                  >
                    {agentDef.label}
                  </text>
                  <text
                    width={14}
                    fg={theme.textMuted}
                    wrapMode="none"
                  >
                    {entry().agent}
                  </text>
                  <text
                    fg={modelDisplay().includes("(default)") ? theme.textMuted : theme.text}
                    wrapMode="none"
                  >
                    {modelDisplay()}
                  </text>
                </box>
              )
            }}
          </For>
        </box>

        <box width="100%" flexDirection="row" marginTop={1}>
          <text fg={theme.textMuted}>
            [↑↓] select  [Enter] change  [d] clear  [s] save  [Esc] close
          </text>
        </box>
      </Show>

      <Show when={editingModel()}>
        <box width="100%" marginBottom={1}>
          <text fg={theme.textMuted}>
            Search:{" "}
          </text>
          <input
            value={modelSearch()}
            onInput={(val) => {
              setModelSearch(val)
              setModelSelectedIndex(0)
            }}
            onSubmit={() => {
              selectModel()
            }}
            focusedBackgroundColor={RGBA.fromInts(30, 30, 30, 255)}
            focusedTextColor={RGBA.fromInts(255, 255, 255, 255)}
            cursorColor={RGBA.fromInts(255, 200, 0, 255)}
            placeholder="provider/model..."
            placeholderColor={theme.textMuted}
            ref={(r) => {
              if (r) {
                setTimeout(() => {
                  if (r && !r.isDestroyed) r.focus()
                }, 1)
              }
            }}
          />
        </box>

        <box width="100%" flexDirection="column" height={MAX_VISIBLE_MODELS + 1}>
          <Show when={visibleModels().length === 0}>
            <text fg={theme.textMuted}>
              No models found
            </text>
          </Show>
          <For each={visibleModels()}>
            {(model, i) => {
              const isModelSelected = createMemo(() => modelSelectedIndex() === i())
              return (
                <box width="100%" flexDirection="row" backgroundColor={isModelSelected() ? RGBA.fromInts(40, 40, 60, 255) : undefined}>
                  <text
                    fg={isModelSelected() ? RGBA.fromInts(255, 200, 0, 255) : theme.text}
                    attributes={isModelSelected() ? TextAttributes.BOLD : undefined}
                  >
                    {isModelSelected() ? "❯ " : "  "}
                    {model.label}
                  </text>
                </box>
              )
            }}
          </For>
        </box>

        <box width="100%" marginTop={1}>
          <text fg={theme.textMuted}>
            [↑↓] select  [Enter] confirm  [Tab] clear  [Esc] cancel
          </text>
        </box>
      </Show>

      <Show when={status() === "saving"}>
        <box width="100%" alignItems="center" marginTop={1}>
          <text fg={theme.warning} attributes={TextAttributes.BOLD}>
            Saving...
          </text>
        </box>
      </Show>

      <Show when={status() === "saved"}>
        <box width="100%" alignItems="center" marginTop={1}>
          <text fg={RGBA.fromInts(0, 200, 100, 255)} attributes={TextAttributes.BOLD}>
            Saved! Config updated.
          </text>
        </box>
      </Show>

      <Show when={status() === "error"}>
        <box width="100%" alignItems="center" marginTop={1}>
          <text fg={RGBA.fromInts(250, 80, 80, 255)} wrapMode="word" width="100%">
            Error: {errorMsg()}
          </text>
        </box>
      </Show>
    </box>
  )
}