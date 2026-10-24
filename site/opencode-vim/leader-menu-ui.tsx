/** @jsxImportSource @opentui/solid */
import { For, Show, type JSX } from "solid-js"
import { useBindings, useKeymapSelector } from "@opentui/keymap/solid"
import {
  DEFAULT_LEADER_MENU,
  isSeparator,
  executeAction,
  type LeaderGroup,
  type LeaderItem,
  type LeaderLeaf,
} from "./leader-menu"
import { setLeader, getLeaderView, setLeaderView, getLeaderSelected, setLeaderSelected } from "./state"

const GROUP_INDEX = "opencode-vim.leader.groupIndex"

function viewGroup(groups: LeaderGroup[], view: string): LeaderGroup | undefined {
  if (view === "groups") return undefined
  if (view.startsWith("items:")) return groups.find((g) => g.key === view.slice(6))
  return undefined
}

export function LeaderMenu(props: { api: import("@opencode-ai/plugin/tui").TuiPluginApi; onClose: () => void }): JSX.Element {
  const groups = DEFAULT_LEADER_MENU
  const km = () => props.api.keymap

  const view = useKeymapSelector((k) => getLeaderView(k))
  const selected = useKeymapSelector((k) => getLeaderSelected(k))
  const groupIndex = useKeymapSelector((k) => (k.getData(GROUP_INDEX) as number | undefined) ?? 0)

  const items = (): LeaderItem[] => {
    const v = view()
    if (v === "groups") return groups as unknown as LeaderItem[]
    const g = viewGroup(groups, v)
    return (g?.items ?? []) as LeaderItem[]
  }

  const openGroup = (g: LeaderGroup) => {
    km().setData(GROUP_INDEX, groups.indexOf(g))
    setLeaderView(km(), `items:${g.key}`)
    setLeaderSelected(km(), 0)
  }

  const back = () => {
    setLeaderView(km(), "groups")
    setLeaderSelected(km(), (km().getData(GROUP_INDEX) as number | undefined) ?? 0)
  }

  const activate = () => {
    const list = items()
    const item = list[selected()]
    if (!item || isSeparator(item)) return
    props.onClose()
    executeAction(props.api, item as LeaderLeaf)
  }

  const groupCommands = groups.map((g) => ({
    name: `vim_leader_open_${g.key}`,
    run() {
      openGroup(g)
    },
  }))

  useBindings(() => ({
    enabled: () => props.api.ui.dialog.open,
    commands: [
      { name: "vim_leader_close", run() { props.onClose() } },
      { name: "vim_leader_activate", run() { activate() } },
      { name: "vim_leader_back", run() { if (view() !== "groups") back(); else props.onClose() } },
      {
        name: "vim_leader_down",
        run() {
          setLeaderSelected(km(), Math.min(items().length - 1, getLeaderSelected(km()) + 1))
        },
      },
      {
        name: "vim_leader_up",
        run() {
          setLeaderSelected(km(), Math.max(0, getLeaderSelected(km()) - 1))
        },
      },
      ...groupCommands,
    ],
    bindings: [
      { key: "escape", cmd: "vim_leader_close" },
      { key: "backspace", cmd: "vim_leader_back" },
      { key: "enter", cmd: "vim_leader_activate" },
      { key: "return", cmd: "vim_leader_activate" },
      { key: "j", cmd: "vim_leader_down" },
      { key: "down", cmd: "vim_leader_down" },
      { key: "k", cmd: "vim_leader_up" },
      { key: "up", cmd: "vim_leader_up" },
      ...groups.map((g) => ({ key: g.key, cmd: `vim_leader_open_${g.key}` })),
    ],
  }))

  const theme = () => props.api.theme.current
  const skin = () => ({
    panel: theme().backgroundPanel,
    border: theme().border,
    text: theme().text,
    muted: theme().textMuted,
    accent: theme().accent,
    selected: theme().selectedListItemText,
  })

  return (
    <box flexDirection="column" width="100%" backgroundColor={skin().panel} paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1}>
      <text fg={skin().accent}>
        <b>LEADER</b>
        <span style={{ fg: skin().muted }}> — space then key{view() !== "groups" ? " · backspace to go back" : ""}</span>
      </text>

      <Show when={view() === "groups"}>
        <box flexDirection="column" gap={0}>
          <For each={groups}>
            {(g, i) => (
              <text fg={i() === groupIndex() ? skin().selected : skin().text}>
                <span style={{ fg: skin().accent }}> {g.key} </span> {g.label}
              </text>
            )}
          </For>
        </box>
      </Show>

      <Show when={view() !== "groups"}>
        <box flexDirection="column" gap={0}>
          <For each={items()}>
            {(item, i) =>
              isSeparator(item) ? (
                <text fg={skin().muted}> ──────────────</text>
              ) : (
                <text fg={i() === selected() ? skin().selected : skin().text}>
                  <span style={{ fg: skin().accent }}> {(item as LeaderLeaf).key} </span> {(item as LeaderLeaf).label}
                </text>
              )
            }
          </For>
        </box>
      </Show>
    </box>
  )
}

export function openLeaderMenu(api: import("@opencode-ai/plugin/tui").TuiPluginApi): void {
  setLeader(api.keymap, true)
  setLeaderView(api.keymap, "groups")
  setLeaderSelected(api.keymap, 0)
  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <LeaderMenu
      api={api}
      onClose={() => {
        setLeader(api.keymap, false)
        api.ui.dialog.clear()
      }}
    />
  ))
}