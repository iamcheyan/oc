import type { MinimalPromptRef, PromptRef } from "@/component/prompt"
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js"
import { useSync } from "@tui/context/sync"
import { Toast, useToast } from "@tui/ui/toast"
import { useArgs } from "@tui/context/args"
import { useRoute, useRouteData } from "@tui/context/route"
import { usePromptRef } from "@tui/context/prompt"
import { useLocal } from "@tui/context/local"
import { useDirectory } from "@tui/context/directory"
import { useEditorContext } from "@tui/context/editor"
import { useDialog } from "@tui/ui/dialog"
import { useBindings } from "@tui/keymap"
import { useThinkingMode, nextThinkingMode } from "@tui/context/thinking"
import { MinimalRendererBackground, useForkTheme } from "@/util/theme"
import { useKV } from "@tui/context/kv"
import { AutocompleteHostProvider } from "@/context/autocomplete-host"
import { MinimalHomePromptFooter, MinimalStatusBar } from "@/component/minimal-layout"
import { getLeaderMenu, useVimHome, useVimMode } from "@/feature/vim-mode"
import { loadVimConfig } from "@/config/vim"

let seededHomePrompt = false

const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function MinimalHome() {
  const sync = useSync()
  const routeData = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<MinimalPromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const directory = useDirectory()
  const dialog = useDialog()
  const toast = useToast()
  const thinking = useThinkingMode()
  const vimMode = useVimMode()
  const { navigate } = useRoute()
  const kv = useKV()
  const { theme } = useForkTheme()
  const leaderMenu = createMemo(() => getLeaderMenu(directory()))
  const vimConfig = createMemo(() => loadVimConfig(directory()))
  const vimHidePrompt = createMemo(() => kv.get("minimal_vim_hide_prompt") ?? vimConfig().hidePrompt ?? false)
  const vimAutoResume = createMemo(() => kv.get("minimal_vim_auto_resume") ?? vimConfig().autoResume ?? false)
  const pureMode = createMemo(() => kv.get("minimal_pure_mode") ?? false)
  let sent = false

  onMount(() => {
    vimMode.enterInsert()
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r as MinimalPromptRef | undefined)
    promptRef.set(r)
    if (seededHomePrompt || !r) return
    if (routeData.prompt) {
      r.set(routeData.prompt)
      seededHomePrompt = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    seededHomePrompt = true
  }

  // Initialize default agent/model if none selected
  createEffect(() => {
    if (!sync.ready || !local.model.ready) return
    
    // If no agent selected, select the first available primary agent
    if (!local.agent.current()) {
      const primaryAgents = local.agent.list().filter((a) => a.mode !== "subagent")
      if (primaryAgents.length > 0) {
        local.agent.set(primaryAgents[0]!.name)
      }
    }
  })

  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  useBindings(() => ({
    bindings: [
      {
        key: "ctrl+c",
        cmd: () => {
          const current = ref()
          if (!current) return true
          const hasDraft = current.current.input !== "" || current.current.parts.length > 0
          if (hasDraft) {
            current.reset()
          }
          if (current.focused === false) return true
          setTimeout(() => current.focus(), 0)
          return true
        },
      },
    ],
    commands: [
      {
        name: "session.toggle.thinking",
        title: "Toggle thinking mode",
        category: "Session",
        run: () => {
          thinking.set(nextThinkingMode(thinking.mode()))
          dialog.clear()
        },
      },
      {
        name: "vim.toggle.hidePrompt",
        title: "Toggle vim hide prompt",
        category: "Vim",
        run: () => {
          const next = !vimHidePrompt()
          kv.set("minimal_vim_hide_prompt", next)
          toast.show({
            message: `Hide prompt: ${next ? "ON" : "OFF"}`,
            variant: "info",
            duration: 2000,
          })
          dialog.clear()
        },
      },
      {
        name: "vim.toggle.autoResume",
        title: "Toggle vim auto resume",
        category: "Vim",
        run: () => {
          const next = !vimAutoResume()
          kv.set("minimal_vim_auto_resume", next)
          toast.show({
            message: `Auto resume: ${next ? "ON" : "OFF"}`,
            variant: "info",
            duration: 2000,
          })
          dialog.clear()
        },
      },
      {
        name: "vim.toggle.pureMode",
        title: "Toggle pure mode",
        category: "Vim",
        run: () => {
          const next = !pureMode()
          kv.set("minimal_pure_mode", next)
          toast.show({
            message: `Pure mode: ${next ? "ON" : "OFF"}`,
            variant: "info",
            duration: 2000,
          })
          dialog.clear()
        },
      },
    ],
  }))

  createEffect(() => {
    if (!sync.ready || sync.status === "loading") return
    if (!vimAutoResume()) return
    const dir = directory()
    const match = sync.data.session
      .filter((s) => s.directory === dir && !s.parentID)
      .toSorted((a, b) => b.time.updated - a.time.updated)[0]
    if (match) {
      navigate({ type: "session", sessionID: match.id })
    }
  })

  useVimHome(
    () => ref(),
    dialog,
    () => directory(),
    leaderMenu,
  )

  return (
    <AutocompleteHostProvider>
      <MinimalRendererBackground />
      <box flexGrow={1} minHeight={0} flexDirection="column">
        <MinimalStatusBar pureMode={pureMode()} />
        <box flexGrow={1} minHeight={0} flexDirection="column" justifyContent="center" alignItems="center">
          <Show when={!pureMode()}>
            <text fg={theme.primary}>{`
 ██████╗  ██████╗    ██╗   ██╗██╗███╗   ███╗
██╔═══██╗██╔════╝    ██║   ██║██║████╗ ████║
██║   ██║██║         ██║   ██║██║██╔████╔██║
██║   ██║██║         ╚██╗ ██╔╝██║██║╚██╔╝██║
╚██████╔╝╚██████╗     ╚████╔╝ ██║██║ ╚═╝ ██║
 ╚═════╝  ╚═════╝      ╚═══╝  ╚═╝╚═╝     ╚═╝
`}</text>
            <text fg={theme.textMuted} marginTop={1}>opencode-vim · Powered by opencode</text>
          </Show>
        </box>
        <MinimalHomePromptFooter bind={bind} placeholders={placeholder} />
        <Toast />
      </box>
    </AutocompleteHostProvider>
  )
}
