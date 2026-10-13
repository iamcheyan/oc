import type { PromptRef } from "@/component/prompt"
import { createEffect, createMemo, createSignal, onMount, Show, untrack } from "solid-js"
import { useData } from "@tui/context/data"
import { useLocation } from "@tui/context/location"
import { useClient } from "@tui/context/client"
import { useRoute } from "@tui/context/route"
import { Toast, useToast } from "@tui/ui/toast"
import { useArgs } from "@tui/context/args"
import { usePromptRef } from "@tui/context/prompt"
import { useLocal } from "@tui/context/local"
import { useEditorContext } from "@tui/context/editor"
import { useDialog } from "@tui/ui/dialog"
import { Keymap } from "@tui/context/keymap"
import { nextThinkingMode } from "@tui/context/thinking"
import { MinimalRendererBackground, useForkTheme } from "@/util/theme"

import { AutocompleteHostProvider } from "@/context/autocomplete-host"
import { MinimalHomePromptFooter, MinimalStatusBar } from "@/component/minimal-layout"
import { getLeaderMenu, useVimHome, useVimMode } from "@/feature/vim-mode"
import { loadVimConfig, saveVimConfig } from "@/config/vim"
import { ForkModelCommand } from "@/component/dialog-model"
import { ModelFreeGuard } from "@/component/model-free-guard"

let seededHomePrompt = false

const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function MinimalHome() {
  const data = useData()
  const client = useClient()
  const location = useLocation()
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dialog = useDialog()
  const toast = useToast()
  const [thinkingMode, setThinkingMode] = createSignal<"show" | "hide">("show")
  const { theme } = useForkTheme()
  const vimMode = useVimMode()
  const route = useRoute()
  const directory = () => location.ref?.directory ?? data.location.default().directory
  const leaderMenu = createMemo(() => getLeaderMenu(directory()))
  const vimConfig = createMemo(() => loadVimConfig(directory()))
  const vimHidePrompt = createMemo(() => vimConfig().hidePrompt ?? false)
  const vimAutoResume = createMemo(() => vimConfig().autoResume ?? false)
  const pureMode = createMemo(() => false)
  const autoAllowPermissions = createMemo(() => vimConfig().autoAllowPermissions ?? false)
  const sessions = () => data.session.list()
  let sent = false

  // Keep the active location synchronized with the location store, without
  // tracking its server data and reasserting the old route on each update.
  createEffect(() => {
    const target = location.ref ?? data.location.default()
    untrack(() => location.set(target))
  })

  onMount(() => {
    vimMode.enterInsert()
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (seededHomePrompt || !r) return
    if (args.prompt) {
      r.set({ text: args.prompt, files: [], agents: [], skills: [], pasted: [] })
      seededHomePrompt = true
    }
  }

  createEffect(() => {
    const current = ref()
    if (!current || !args.prompt || current.current.text !== args.prompt) return
    if (!local.model.ready || !local.model.catalogReady) return
    if (!local.agent.current() || !local.model.current()) return
    if (sent) return
    sent = true
    current.submit()
  })

  // Initialize the default agent from the current V2 location store.
  createEffect(() => {
    const agents = data.location.agent.list(location.ref)
    if (agents === undefined) return
    if (!local.agent.current()) {
      const primaryAgents = agents.filter((agent) => agent.mode !== "subagent" && !agent.hidden)
      if (primaryAgents.length > 0) local.agent.set(primaryAgents[0]!.name)
    }
  })

  Keymap.createLayer(() => ({
    mode: "global",
    commands: [
      {
        id: "vim.home.clearPrompt",
        title: "Clear prompt",
        bind: "ctrl+c",
        run: () => {
          const current = ref()
          if (!current) return
          const hasDraft = current.current.text !== "" || (current.current.files?.length ?? 0) > 0 || current.current.pasted.length > 0
          if (hasDraft) current.reset()
          if (current.focused === false) return
          setTimeout(() => current.focus(), 0)
        },
      },
      {
        id: "session.toggle.thinking",
        title: "Toggle thinking mode",
        category: "Session",
        run: () => {
          setThinkingMode(nextThinkingMode(thinkingMode()))
          dialog.clear()
        },
      },
      {
        id: "vim.toggle.hidePrompt",
        title: "Toggle vim hide prompt",
        category: "Vim",
        run: () => {
          const next = !vimHidePrompt()
          saveVimConfig(directory(), { hidePrompt: next })
          toast.show({ message: `Hide prompt: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 })
          dialog.clear()
        },
      },
      {
        id: "vim.toggle.autoResume",
        title: "Toggle vim auto resume",
        category: "Vim",
        run: () => {
          const next = !vimAutoResume()
          saveVimConfig(directory(), { autoResume: next })
          toast.show({ message: `Auto resume: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 })
          dialog.clear()
        },
      },
      {
        id: "vim.toggle.pureMode",
        title: "Toggle pure mode",
        category: "Vim",
        run: () => {
          const next = !pureMode()
          toast.show({ message: `Pure mode: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 })
          dialog.clear()
        },
      },
      {
        id: "vim.toggle.autoAllowPermissions",
        title: "Toggle auto-allow permissions",
        category: "Vim",
        run: () => {
          const next = !autoAllowPermissions()
          saveVimConfig(directory(), { autoAllowPermissions: next })
          toast.show({ message: `Auto-allow permissions: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 })
          dialog.clear()
        },
      },
    ],
  }))

  createEffect(() => {
    if (client.connection.status() !== "connected") return
    if (!vimAutoResume()) return
    const dir = directory()
    const match = sessions()
      .filter((session) => !session.parentID && session.location?.directory === dir)
      .toSorted((a, b) => b.time.updated - a.time.updated)[0]
    if (match) route.navigate({ type: "session", sessionID: match.id })
  })

  useVimHome(
    () => ref() as import("@/component/prompt").MinimalPromptRef | undefined,
    dialog,
    directory,
    leaderMenu,
  )

  return (
    <AutocompleteHostProvider>
      <ModelFreeGuard />
      <ForkModelCommand />
      <MinimalRendererBackground />
      <box flexGrow={1} minHeight={0} flexDirection="column">
        <MinimalStatusBar pureMode={pureMode()} />
        <box flexGrow={1} minHeight={0} flexDirection="column" justifyContent="center" alignItems="center">
          <Show when={!pureMode()}>
            <text fg={theme.categorical[0][500]}>{`\n ██████╗  ██████╗    ██╗   ██╗██╗███╗   ███╗\n██╔═══██╗██╔════╝    ██║   ██║██║████╗ ████║\n██║   ██║██║         ██║   ██║██║██╔████╔██║\n██║   ██║██║         ╚██╗ ██╔╝██║██║╚██╔╝██║\n╚██████╔╝╚██████╗     ╚████╔╝ ██║██║ ╚═╝ ██║\n ╚═════╝  ╚═════╝      ╚═══╝  ╚═╝╚═╝     ╚═╝\n`}</text>
            <text fg={theme.text.muted} marginTop={1}>opencode-vim · Powered by opencode</text>
          </Show>
        </box>
        <MinimalHomePromptFooter bind={bind} placeholders={placeholder} />
        <Toast />
      </box>
    </AutocompleteHostProvider>
  )
}
