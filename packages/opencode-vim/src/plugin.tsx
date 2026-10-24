import { Plugin } from "@opencode/plugin/tui"
import type { KeymapLayer } from "@opencode/plugin/tui/context"
import { Show } from "solid-js"
import { MinimalHome } from "./routes/home"
import { MinimalSession } from "./routes/session"
import { installMinimalRootComponents } from "./root-components"
import { useLocal } from "../../tui/src/context/local"
import { useLocation } from "../../tui/src/context/location"
import { useTheme } from "../../tui/src/context/theme"

export const VimPlugin = Plugin.define({
  id: "opencode.vim",
  setup(context) {
    installMinimalRootComponents()
    context.ui.router.register({ name: "vim-home", render: () => <MinimalHome /> })
    context.ui.router.register({ name: "vim-session", render: ({ data }) => {
      const current = context.ui.router.current()
      const sessionID = typeof data?.sessionID === "string" ? data.sessionID : current.type === "session" ? current.sessionID : undefined
      return sessionID ? <MinimalSession sessionID={sessionID} /> : <text>Open this view from a session</text>
    } })
    context.ui.slot({ append: "home.footer", render: () => <HomeFooter /> })
    context.ui.slot({ append: "session.composer.top", render: () => <SessionFooter /> })
    context.keymap.layer((): KeymapLayer => ({
      mode: "global",
      commands: [
        { id: "vim.home", title: "Go home", group: "Vim", bind: false, run: () => context.ui.router.navigate({ type: "home" }) },
        { id: "vim.next-session", title: "Next session", group: "Vim", bind: "] s", run: () => moveTab(context.ui.tabs.list(), context.ui.tabs.focus, 1) },
        { id: "vim.previous-session", title: "Previous session", group: "Vim", bind: "[ s", run: () => moveTab(context.ui.tabs.list(), context.ui.tabs.focus, -1) },
      ],
    }))
  },
})

function moveTab(tabs: readonly { readonly sessionID: string; readonly active: boolean }[], focus: (id: string) => boolean, direction: 1 | -1) {
  if (!tabs.length) return
  const index = tabs.findIndex((tab) => tab.active)
  const next = tabs[(index + direction + tabs.length) % tabs.length]
  if (next) focus(next.sessionID)
}

function HomeFooter() {
  if ((globalThis as { OPENCODE_TUI_ROOT_COMPONENTS?: unknown }).OPENCODE_TUI_ROOT_COMPONENTS) return null
  const local = useLocal()
  const theme = useTheme()
  return <box width="100%" flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
    <text fg={theme.text.muted}>vim • {local.agent.current()?.name ?? "agent"}</text>
    <text fg={theme.text.muted}>j/k navigate • enter insert • g g home</text>
  </box>
}

function SessionFooter() {
  if ((globalThis as { OPENCODE_TUI_ROOT_COMPONENTS?: unknown }).OPENCODE_TUI_ROOT_COMPONENTS) return null
  const local = useLocal()
  const location = useLocation()
  const theme = useTheme()
  return <box paddingLeft={2} paddingBottom={1} flexDirection="row" gap={1}>
    <text fg={theme.text.action.primary.selected}>vim</text>
    <text fg={theme.text.muted}>{local.agent.current()?.name ?? "agent"}</text>
    <text fg={theme.text.muted}>{local.model.current()?.modelID ?? "select model"}</text>
    <Show when={location.current}>{(value) => <text fg={theme.text.muted}>{value().directory}</text>}</Show>
  </box>
}
