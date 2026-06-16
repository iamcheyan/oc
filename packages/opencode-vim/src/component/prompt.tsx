import {
  BoxRenderable,
  RGBA,
  TextAttributes,
  TextareaRenderable,
  MouseEvent,
  PasteEvent,
  decodePasteBytes,
  type KeyEvent,
  type Renderable,
} from "@opentui/core"
import type { CommandContext } from "@opentui/keymap"
import { createEffect, createMemo, onMount, createSignal, onCleanup, on, Show, Switch, Match, For } from "solid-js"
import path from "path"
import { fileURLToPath } from "url"
import { Filesystem } from "@/util/filesystem"
import { useLocal } from "@tui/context/local"
import { tint, useForkTheme } from "@/util/theme"
import { EmptyBorder, SplitBorder } from "@tui/ui/border"
import { Spinner } from "@tui/component/spinner"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { useEvent } from "@tui/context/event"
import { editorSelectionKey, useEditorContext, type EditorSelection } from "@tui/context/editor"
import { MessageID, PartID } from "@/session/schema"
import { createStore, produce, unwrap } from "solid-js/store"
import { usePromptHistory, type PromptInfo } from "@tui/prompt/history"
import { computePromptTraits } from "@tui/prompt/traits"
import { expandPastedTextPlaceholders } from "@tui/prompt/part"
import { usePromptStash } from "@tui/prompt/stash"
import { DialogStash } from "@tui/component/dialog-stash"
import { type AutocompleteRef } from "./autocomplete"
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import { openEditor } from "@tui/editor"
import { destroyRenderer } from "@tui/util/renderer"
import { read as readClipboard } from "@tui/clipboard"
import type { AssistantMessage, FilePart, UserMessage } from "@opencode-ai/sdk/v2"
import { iife } from "@/util/iife"
import { Locale } from "@/util/locale"
import { formatDuration } from "@tui/util/format"
import { useDialog } from "@tui/ui/dialog"
import { DialogProvider as DialogProviderConnect } from "@tui/component/dialog-provider"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { useToast } from "@tui/ui/toast"
import { useKV } from "@tui/context/kv"
import { createFadeIn } from "@tui/util/signal"
import { DialogSkill } from "@/component/dialog-skill"
import { useDirectory } from "@tui/context/directory"
import {
  confirmWorkspaceFileChanges,
  openWorkspaceSelect,
  warpWorkspaceSession,
  type WorkspaceSelection,
} from "@tui/component/dialog-workspace-create"
import { DialogWorkspaceUnavailable } from "@tui/component/dialog-workspace-unavailable"
import { useArgs } from "@tui/context/args"
import { Flag } from "@opencode-ai/core/flag/flag"
import { type WorkspaceStatus } from "@tui/component/workspace-label"
import { useBindings, useCommandShortcut, useOpencodeKeymap } from "@tui/keymap"
import { reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { useTuiConfig } from "@tui/config"
import { useAutocompleteHost } from "@/context/autocomplete-host"
import { useVimMode } from "@/feature/vim-mode"
import { getLeaderMenu, isSeparator, type LeaderGroup, type LeaderLeaf, type LeaderSeparator } from "@/feature/leader-menu"
import { loadVimConfig } from "@/config/vim"

export type PromptProps = {
  sessionID?: string
  visible?: boolean
  disabled?: boolean
  compact?: boolean
  onSubmit?: () => void
  ref?: (ref: PromptRef | undefined) => void
  hint?: JSX.Element
  right?: JSX.Element
  showPlaceholder?: boolean
  placeholders?: {
    normal?: string[]
    shell?: string[]
  }
  onUpWhenEmpty?: () => void
  onDownWhenEmpty?: () => void
  onEnterEmpty?: () => boolean | void
  menu?: LeaderGroup[]
}

export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}

export type MinimalPromptRef = PromptRef & {
  insert(text: string): void
  interrupt(): void
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const DRAFT_RETENTION_MIN_CHARS = 20

function randomIndex(count: number) {
  if (count <= 0) return 0
  return Math.floor(Math.random() * count)
}

function fadeColor(color: RGBA, alpha: number) {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha)
}

function hasEditorRangeSelection(selection: EditorSelection["ranges"][number]) {
  return (
    selection.selection.start.line !== selection.selection.end.line ||
    selection.selection.start.character !== selection.selection.end.character
  )
}

function getEditorRangeLabel(selection: EditorSelection["ranges"][number]) {
  if (!hasEditorRangeSelection(selection)) return
  if (selection.selection.start.line === selection.selection.end.line) return `#${selection.selection.start.line}`
  return `#${selection.selection.start.line}-${selection.selection.end.line}`
}

function formatEditorContext(selection: EditorSelection) {
  const selected = selection.ranges.filter(hasEditorRangeSelection)
  if (selected.length === 0)
    return `<system-reminder>Note: The user opened the file "${selection.filePath}". This may or may not be relevant to the current task.</system-reminder>\n`

  const ranges = selected.map((range, index) => {
    const prefix = selected.length > 1 ? `Selection ${index + 1}: ` : ""
    return `Note: The user selected ${prefix}${getEditorRangeLabel(range)} from "${selection.filePath}". \`\`\`${range.text}\`\`\`\n\n`
  })

  return `<system-reminder>${ranges.join("\n")} This may or may not be relevant to the current task.</system-reminder>\n`
}

let stashed: { prompt: PromptInfo; cursor: number } | undefined

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable
  const [inputTarget, setInputTarget] = createSignal<TextareaRenderable | undefined>()

  const vimMode = useVimMode()
  const directory = useDirectory()
  const kv = useKV()
  const vimConfig = createMemo(() => loadVimConfig(directory()))
  const vimHidePrompt = createMemo(() => kv.get("minimal_vim_hide_prompt") ?? vimConfig().hidePrompt ?? false)
  const vimAutoResume = createMemo(() => kv.get("minimal_vim_auto_resume") ?? vimConfig().autoResume ?? false)
  const leaderMenu = createMemo(() => props.menu ?? getLeaderMenu(directory()))
  const isLeaderActive = createMemo(() => {
    if (!vimMode.isNormal()) return false
    return vimMode.isLeaderActive?.() || false
  })
  const leaderActiveGroup = createMemo(() => leaderMenu().find((item) => item.key === vimMode.leaderGroup?.()))
  const leaderVisibleItems = createMemo(() => {
    const group = leaderActiveGroup()
    if (group) return group.items as (LeaderLeaf | LeaderSeparator)[]
    return leaderMenu() as unknown as (LeaderLeaf | LeaderSeparator)[]
  })
  const leaderMenuHint = createMemo(() => {
    if (!isLeaderActive()) return undefined
    const items = leaderVisibleItems()
      .filter((item) => !isSeparator(item))
      .map((item) => `${item.key} ${"items" in item ? `+${item.label}` : item.label}`)
    return items.join("  ")
  })
  const leaderMenuTitle = createMemo(() => {
    const group = leaderActiveGroup()
    if (!group) return "LEADER MENU"
    return `LEADER ${group.key.toUpperCase()}`
  })
  const leaderMenuSubtitle = createMemo(() => {
    const group = leaderActiveGroup()
    if (!group) return "SPC"
    return `SPC ${group.key}`
  })
  const leaderMenuDynamicItems = createMemo(() => {
    return leaderVisibleItems().map((item) => {
      if (isSeparator(item)) return item
      
      let label = item.label
      let icon = item.icon

      if ("command" in item) {
        if (item.command === "vim.toggle.hidePrompt") {
          const isHidden = vimHidePrompt()
          label = isHidden ? "show prompt" : "hide prompt"
          icon = isHidden ? "" : ""
        } else if (item.command === "vim.toggle.autoResume") {
          const isAuto = vimAutoResume()
          label = isAuto ? "disable auto resume" : "enable auto resume"
          icon = isAuto ? "" : ""
        } else if (item.command === "session.toggle.thinking") {
          const isShowing = kv.get("thinking_mode") === "show"
          label = isShowing ? "hide thinking" : "show thinking"
          icon = isShowing ? "" : ""
        } else if (item.command === "session.sidebar.toggle") {
          const isShowing = kv.get("minimal_sidebar_visible") === true
          label = isShowing ? "hide sidebar" : "show sidebar"
          icon = isShowing ? "" : ""
        }
      }

      return {
        ...item,
        label,
        icon,
      }
    })
  })
  const selectableItems = createMemo(() => {
    return leaderMenuDynamicItems().filter((item) => !isSeparator(item))
  })
  const selectedItem = createMemo(() => {
    const items = selectableItems()
    return items[vimMode.leaderSelectedIndex?.() ?? 0]
  })
  const leaderMenuWidth = createMemo(() => {
    let maxLen = 28 // minimum default width to keep headers nice
    // Check title/subtitle length
    const title = leaderMenuTitle()
    const subtitle = leaderMenuSubtitle()
    if (title.length + subtitle.length + 4 > maxLen) {
      maxLen = title.length + subtitle.length + 4
    }
    // Check items length
    for (const item of leaderMenuDynamicItems()) {
      if (isSeparator(item)) continue
      // Format: key (1) + " → " (3) + (icon ? 2 : 0) + (label)
      const keyLen = item.key.length
      const arrowLen = 3
      const iconLen = "icon" in item && item.icon ? 2 : 0
      const labelText = "items" in item ? `+${item.label}` : item.label
      const labelLen = labelText.length
      const totalItemLen = keyLen + arrowLen + iconLen + labelLen
      if (totalItemLen > maxLen) {
        maxLen = totalItemLen
      }
    }
    // Also check bottom hints length
    if (26 > maxLen) {
      maxLen = 26
    }
    return maxLen + 4
  })
  const local = useLocal()
  const args = useArgs()
  const sdk = useSDK()
  const editor = useEditorContext()
  const route = useRoute()
  const project = useProject()
  const sync = useSync()
  const tuiConfig = useTuiConfig()
  const dialog = useDialog()
  const toast = useToast()
  const status = createMemo(() => sync.data.session_status?.[props.sessionID ?? ""] ?? { type: "idle" })
  const [activityFrame, setActivityFrame] = createSignal(0)
  createEffect(() => {
    if (status().type === "idle") {
      setActivityFrame(0)
      return
    }
    const timer = setInterval(() => setActivityFrame((i) => (i + 1) % 2), 500)
    onCleanup(() => clearInterval(timer))
  })
  const history = usePromptHistory()
  const stash = usePromptStash()
  const commandMatcher = reactiveMatcherFromSignal(() => true)
  const keymap = useOpencodeKeymap()
  const agentShortcut = useCommandShortcut("agent.cycle")
  const paletteShortcut = useCommandShortcut("command.palette.show")
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const { theme, syntax } = useForkTheme()
  const animationsEnabled = createMemo(() => kv.get("animations_enabled", true))
  const list = createMemo(() => props.placeholders?.normal ?? [])
  const shell = createMemo(() => props.placeholders?.shell ?? [])
  const fileContextEnabled = createMemo(() => kv.get("file_context_enabled", true))
  const [dismissedEditorSelectionKey, setDismissedEditorSelectionKey] = createSignal<string>()
  const editorContext = createMemo(() => {
    const selection = fileContextEnabled() ? editor.selection() : undefined
    if (!selection) return
    return editorSelectionKey(selection) === dismissedEditorSelectionKey() ? undefined : selection
  })
  const editorPath = createMemo(() => editorContext()?.filePath)
  const editorSelectionLabel = createMemo(() => {
    const ranges = editorContext()?.ranges
    if (!ranges) return
    const first = ranges.find(hasEditorRangeSelection) ?? ranges[0]
    if (!first) return
    return [getEditorRangeLabel(first), ranges.length > 1 ? `+${ranges.length - 1}` : undefined]
      .filter(Boolean)
      .join(" ")
  })
  const editorFileLabel = createMemo(() => {
    const value = editorPath()
    if (!value) return
    const filename = path.basename(value)
    const file = /^index\.[^./]+$/.test(filename)
      ? [path.basename(path.dirname(value)), filename].filter(Boolean).join("/")
      : filename
    return `${file.split(path.sep).join("/")}${editorSelectionLabel() ?? ""}`
  })
  const editorFileLabelDisplay = createMemo(() => {
    const file = editorFileLabel()
    if (!file) return
    return Locale.truncateMiddle(file, Math.max(12, Math.min(48, Math.floor(dimensions().width / 3))))
  })
  const editorContextLabelState = createMemo(() => editor.labelState())
  const [auto, setAuto] = createSignal<AutocompleteRef>()
  const [workspaceSelection, setWorkspaceSelection] = createSignal<WorkspaceSelection>()
  const [workspaceCreating, setWorkspaceCreating] = createSignal(false)
  const [workspaceCreatingDots, setWorkspaceCreatingDots] = createSignal(3)
  const [warpNotice, setWarpNotice] = createSignal<string>()
  const [cursorVersion, setCursorVersion] = createSignal(0)
  const hasRightContent = createMemo(() => Boolean(props.right))
  const autocompleteHost = useAutocompleteHost()

  function selectWorkspace(selection: WorkspaceSelection | undefined) {
    setWorkspaceSelection(selection)
  }

  function setCreatingWorkspace(creating: boolean) {
    setWorkspaceCreating(creating)
  }

  function showWarpNotice(name: string) {
    setWarpNotice(`Warped to ${name}`)
    setTimeout(() => setWarpNotice(undefined), 4000)
  }

  async function createWorkspace(selection: Extract<WorkspaceSelection, { type: "new" }>) {
    setCreatingWorkspace(true)
    const result = await sdk.client.experimental.workspace
      .create({ type: selection.workspaceType, branch: null })
      .catch(() => undefined)
    if (result == undefined || result.error || !result.data) {
      selectWorkspace(undefined)
      setCreatingWorkspace(false)
      toast.show({
        message: "Creating workspace failed",
        variant: "error",
      })
      return
    }

    await project.workspace.sync()
    const workspace = result.data
    selectWorkspace({
      type: "existing",
      workspaceID: workspace.id,
      workspaceType: workspace.type,
      workspaceName: workspace.name,
    })
    setCreatingWorkspace(false)
    return workspace
  }

  async function warpSession(selection: WorkspaceSelection) {
    if (!props.sessionID) {
      selectWorkspace(selection)
      dialog.clear()
      if (selection.type === "new") void createWorkspace(selection)
      return
    }
    const sourceWorkspaceID = project.workspace.current()
    const copyChanges = await confirmWorkspaceFileChanges({ dialog, sdk, sourceWorkspaceID })
    if (copyChanges === undefined) return
    selectWorkspace(selection)
    dialog.clear()

    const workspace =
      selection.type === "none"
        ? { id: null, name: "local project" }
        : selection.type === "existing"
          ? { id: selection.workspaceID, name: selection.workspaceName }
          : await createWorkspace(selection)
    if (!workspace) return

    const warped = await warpWorkspaceSession({
      dialog,
      sdk,
      sync,
      project,
      toast,
      sourceWorkspaceID,
      workspaceID: workspace.id,
      sessionID: props.sessionID,
      copyChanges,
    })
    if (warped) showWarpNotice(workspace.name)
  }

  createEffect(() => {
    if (!workspaceCreating()) {
      setWorkspaceCreatingDots(3)
      return
    }
    const timer = setInterval(() => setWorkspaceCreatingDots((dots) => (dots % 3) + 1), 1000)
    onCleanup(() => clearInterval(timer))
  })

  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: "Connect a provider to send prompts",
      duration: 3000,
    })
    if (sync.data.provider.length === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }

  function dismissEditorContext() {
    setDismissedEditorSelectionKey(editorSelectionKey(editorContext()))
    editor.clearSelection()
  }
  const fileStyleId = syntax().getStyleId("extmark.file")!
  const agentStyleId = syntax().getStyleId("extmark.agent")!
  const pasteStyleId = syntax().getStyleId("extmark.paste")!
  let promptPartTypeId = 0
  const event = useEvent()

  event.on("tui.prompt.append", (evt) => {
    if (!input || input.isDestroyed) return
    input.insertText(evt.properties.text)
    setTimeout(() => {
      // setTimeout is a workaround and needs to be addressed properly
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    if (props.disabled) input.cursorColor = theme.backgroundElement
    if (!props.disabled) input.cursorColor = theme.text
  })

  const lastUserMessage = createMemo(() => {
    if (!props.sessionID) return undefined
    const messages = sync.data.message[props.sessionID]
    if (!messages) return undefined
    return messages.findLast((m): m is UserMessage => m.role === "user")
  })

  const usage = createMemo(() => {
    if (!props.sessionID) return
    const session = sync.session.get(props.sessionID)
    const msg = sync.data.message[props.sessionID] ?? []
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return

    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const pct = model?.limit.context ? `${Math.round((tokens / model.limit.context) * 100)}%` : undefined
    const cost = session?.cost ?? 0
    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: cost > 0 ? money.format(cost) : undefined,
    }
  })

  const [store, setStore] = createStore<{
    prompt: PromptInfo
    mode: "normal" | "shell"
    extmarkToPartIndex: Map<number, number>
    interrupt: number
    placeholder: number
  }>({
    placeholder: randomIndex(list().length),
    prompt: {
      input: "",
      parts: [],
    },
    mode: "normal",
    extmarkToPartIndex: new Map(),
    interrupt: 0,
  })

  createEffect(
    on(
      () => props.sessionID,
      () => {
        setStore("placeholder", randomIndex(list().length))
      },
      { defer: true },
    ),
  )

  // Initialize agent/model/variant from last user message when session changes
  let syncedSessionID: string | undefined
  createEffect(() => {
    const sessionID = props.sessionID
    const msg = lastUserMessage()

    if (sessionID !== syncedSessionID) {
      if (!sessionID || !msg) return

      syncedSessionID = sessionID

      // Only set agent if it's a primary agent (not a subagent)
      const isPrimaryAgent = local.agent.list().some((x) => x.name === msg.agent)
      if (msg.agent && isPrimaryAgent) {
        // Keep command line --agent if specified.
        if (!args.agent) local.agent.set(msg.agent)
        if (msg.model) {
          local.model.set(msg.model)
          local.model.variant.set(msg.model.variant)
        }
      }
    }
  })

  const promptCommands = createMemo(() =>
    [
      {
        title: "Clear prompt",
        name: "prompt.clear",
        category: "Prompt",
        hidden: true,
        run: () => {
          clearPrompt()
          dialog.clear()
        },
      },
      {
        title: "Submit prompt",
        name: "prompt.submit",
        category: "Prompt",
        hidden: true,
        run: async () => {
          if (!input.focused) return
          const handled = await submit()
          if (!handled) return

          dialog.clear()
        },
      },
      {
        title: "Remove editor context",
        name: "prompt.editor_context.clear",
        category: "Prompt",
        enabled: Boolean(editorContext()),
        run: () => {
          dismissEditorContext()
          dialog.clear()
        },
      },
      {
        title: "Paste",
        name: "prompt.paste",
        category: "Prompt",
        hidden: true,
        run: async (ctx: CommandContext<Renderable, KeyEvent>) => {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const content = await readClipboard()
          if (content?.mime.startsWith("image/")) {
            await pasteAttachment({
              filename: "clipboard",
              mime: content.mime,
              content: content.data,
            })
            return
          }
          if (content?.mime === "text/plain") {
            await pasteInputText(content.data)
          }
        },
      },
      {
        title: "Interrupt session",
        name: "session.interrupt",
        category: "Session",
        hidden: true,
        enabled: status().type !== "idle",
        run: () => {
          if (!input.focused) return
          ref.interrupt()
        },
      },
      {
        title: "Open editor",
        category: "Session",
        name: "prompt.editor",
        slashName: "editor",
        run: async () => {
          dialog.clear()

          // replace summarized text parts with the actual text
          const text = store.prompt.parts
            .filter((p) => p.type === "text")
            .reduce((acc, p) => {
              if (!p.source) return acc
              return acc.replace(p.source.text.value, p.text)
            }, store.prompt.input)

          const nonTextParts = store.prompt.parts.filter((p) => p.type !== "text")

          const value = text
          const content = await openEditor({ value, renderer })
          if (!content) return

          input.setText(content)

          // Update positions for nonTextParts based on their location in new content
          // Filter out parts whose virtual text was deleted
          // this handles a case where the user edits the text in the editor
          // such that the virtual text moves around or is deleted
          const updatedNonTextParts = nonTextParts
            .map((part) => {
              let virtualText = ""
              if (part.type === "file" && part.source?.text) {
                virtualText = part.source.text.value
              } else if (part.type === "agent" && part.source) {
                virtualText = part.source.value
              }

              if (!virtualText) return part

              const newStart = content.indexOf(virtualText)
              // if the virtual text is deleted, remove the part
              if (newStart === -1) return null

              const newEnd = newStart + virtualText.length

              if (part.type === "file" && part.source?.text) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    text: {
                      ...part.source.text,
                      start: newStart,
                      end: newEnd,
                    },
                  },
                }
              }

              if (part.type === "agent" && part.source) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    start: newStart,
                    end: newEnd,
                  },
                }
              }

              return part
            })
            .filter((part) => part !== null)

          setStore("prompt", {
            input: content,
            // keep only the non-text parts because the text parts were
            // already expanded inline
            parts: updatedNonTextParts,
          })
          restoreExtmarksFromParts(updatedNonTextParts)
          input.cursorOffset = Bun.stringWidth(content)
        },
      },
      {
        title: "Skills",
        name: "prompt.skills",
        category: "Prompt",
        slashName: "skills",
        run: () => {
          const skillFilter = (globalThis as { __SKILL_FILTER__?: string }).__SKILL_FILTER__
          delete (globalThis as { __SKILL_FILTER__?: string }).__SKILL_FILTER__
          dialog.replace(() => (
            <DialogSkill
              initialFilter={skillFilter}
              onSelect={(skill) => {
                input.setText(`/${skill} `)
                setStore("prompt", {
                  input: `/${skill} `,
                  parts: [],
                })
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
      {
        title: "Warp",
        desc: "Change the workspace for the session",
        name: "workspace.set",
        category: "Session",
        enabled: Flag.OPENCODE_EXPERIMENTAL_WORKSPACES,
        slashName: "warp",
        run: () => {
          void openWorkspaceSelect({
            dialog,
            sdk,
            sync,
            project,
            toast,
            onSelect: (selection) => {
              void warpSession(selection)
            },
          })
        },
      },
    ].map((entry) => ({
      namespace: "palette",
      ...entry,
    })),
  )

  useBindings(() => ({
    commands: promptCommands(),
  }))

  useBindings(() => ({
    enabled: commandMatcher,
    bindings: tuiConfig.keybinds.gather("prompt.palette", [
      "prompt.submit",
      "prompt.editor",
      "prompt.editor_context.clear",
      "prompt.stash",
      "prompt.stash.pop",
      "prompt.stash.list",
      "session.interrupt",
      "workspace.set",
    ]),
  }))


  useBindings(() => ({
    target: inputTarget,
    enabled: () => inputTarget() !== undefined && !props.disabled && !vimMode.isNormal(),
    bindings: [
      {
        key: "escape",
        cmd: () => {
          vimMode.enterNormal()
          setStore("mode", "normal")
          inputTarget()?.blur()
        },
      },
    ],
  }))

  // Blur textarea when leader menu opens so the menu can capture keyboard input
  createEffect(() => {
    if (isLeaderActive()) {
      input.blur()
    }
  })

  const ref: MinimalPromptRef = {
    get focused() {
      return input.focused
    },
    get current() {
      return store.prompt
    },
    focus() {
      if (vimMode.isNormal()) return
      input.focus()
    },
    blur() {
      input.blur()
    },
    set(prompt) {
      input.setText(prompt.input)
      setStore("prompt", prompt)
      restoreExtmarksFromParts(prompt.parts)
      input.gotoBufferEnd()
    },
    reset() {
      input.clear()
      input.extmarks.clear()
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
    },
    insert(text) {
      input.insertText(text)
      setTimeout(() => {
        if (!input || input.isDestroyed) return
        input.getLayoutNode().markDirty()
        renderer.requestRender()
      }, 0)
    },
    interrupt() {
      if (auto()?.visible) return
      if (store.mode === "shell") {
        setStore("mode", "normal")
        return
      }
      if (!props.sessionID || status().type === "idle") return

      setStore("interrupt", store.interrupt + 1)

      setTimeout(() => {
        setStore("interrupt", 0)
      }, 5000)

      if (store.interrupt >= 2) {
        void sdk.client.session.abort({
          sessionID: props.sessionID,
        })
        setStore("interrupt", 0)
      }
      dialog.clear()
    },
    submit() {
      void submit()
    },
  }

  onMount(() => {
    const saved = stashed
    stashed = undefined
    if (store.prompt.input) return
    if (saved && saved.prompt.input) {
      input.setText(saved.prompt.input)
      setStore("prompt", saved.prompt)
      restoreExtmarksFromParts(saved.prompt.parts)
      input.cursorOffset = saved.cursor
    }
  })

  onCleanup(() => {
    if (store.prompt.input) {
      stashed = { prompt: unwrap(store.prompt), cursor: input.cursorOffset }
    }
    setInputTarget(undefined)
    props.ref?.(undefined)
  })

  createEffect(() => {
    if (!input) return

    const autocompleteProps = {
      sessionID: props.sessionID,
      ref: (r: AutocompleteRef) => {
        setAuto(() => r)
      },
      origin: () => anchor,
      anchor: () => input,
      input: () => input,
      setPrompt: (cb: (input: PromptInfo) => void) => {
        setStore("prompt", produce(cb))
      },
      setExtmark: (partIndex: number, extmarkId: number) => {
        setStore("extmarkToPartIndex", (map: Map<number, number>) => {
          const newMap = new Map(map)
          newMap.set(extmarkId, partIndex)
          return newMap
        })
      },
      value: store.prompt.input,
      fileStyleId,
      agentStyleId,
      promptPartTypeId: () => promptPartTypeId,
    }

    autocompleteHost.setProps(autocompleteProps)
    onCleanup(() => autocompleteHost.clearProps(autocompleteProps))
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    if (vimMode.isNormal()) {
      if (input.focused) input.blur()
      return
    }
    if (props.visible === false || dialog.stack.length > 0) {
      if (input.focused) input.blur()
      return
    }

    // Slot/plugin updates can remount the background prompt while a dialog is open.
    // Keep focus with the dialog and let the prompt reclaim it after the dialog closes.
    if (!input.focused) input.focus()
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    input.traits = {
      ...input.traits,
      ...computePromptTraits({
        mode: store.mode,
        autocompleteVisible: !!auto()?.visible,
      }),
    }
  })

  function restoreExtmarksFromParts(parts: PromptInfo["parts"]) {
    input.extmarks.clear()
    setStore("extmarkToPartIndex", new Map())

    parts.forEach((part, partIndex) => {
      let start = 0
      let end = 0
      let virtualText = ""
      let styleId: number | undefined

      if (part.type === "file" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = fileStyleId
      } else if (part.type === "agent" && part.source) {
        start = part.source.start
        end = part.source.end
        virtualText = part.source.value
        styleId = agentStyleId
      } else if (part.type === "text" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = pasteStyleId
      }

      if (virtualText) {
        const extmarkId = input.extmarks.create({
          start,
          end,
          virtual: true,
          styleId,
          typeId: promptPartTypeId,
        })
        setStore("extmarkToPartIndex", (map: Map<number, number>) => {
          const newMap = new Map(map)
          newMap.set(extmarkId, partIndex)
          return newMap
        })
      }
    })
  }

  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    setStore(
      produce((draft) => {
        const newMap = new Map<number, number>()
        const newParts: typeof draft.prompt.parts = []

        for (const extmark of allExtmarks) {
          const partIndex = draft.extmarkToPartIndex.get(extmark.id)
          if (partIndex !== undefined) {
            const part = draft.prompt.parts[partIndex]
            if (part) {
              if (part.type === "agent" && part.source) {
                part.source.start = extmark.start
                part.source.end = extmark.end
              } else if (part.type === "file" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              } else if (part.type === "text" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              }
              newMap.set(extmark.id, newParts.length)
              newParts.push(part)
            }
          }
        }

        draft.extmarkToPartIndex = newMap
        draft.prompt.parts = newParts
      }),
    )
  }

  const stashCommands = createMemo(() =>
    [
      {
        title: "Stash prompt",
        name: "prompt.stash",
        category: "Prompt",
        enabled: !!store.prompt.input,
        run: () => {
          if (!store.prompt.input) return
          stash.push({
            input: store.prompt.input,
            parts: store.prompt.parts,
          })
          input.extmarks.clear()
          input.clear()
          setStore("prompt", { input: "", parts: [] })
          setStore("extmarkToPartIndex", new Map())
          dialog.clear()
        },
      },
      {
        title: "Stash pop",
        name: "prompt.stash.pop",
        category: "Prompt",
        enabled: stash.list().length > 0,
        run: () => {
          const entry = stash.pop()
          if (entry) {
            input.setText(entry.input)
            setStore("prompt", { input: entry.input, parts: entry.parts })
            restoreExtmarksFromParts(entry.parts)
            input.gotoBufferEnd()
          }
          dialog.clear()
        },
      },
      {
        title: "Stash list",
        name: "prompt.stash.list",
        category: "Prompt",
        enabled: stash.list().length > 0,
        run: () => {
          dialog.replace(() => (
            <DialogStash
              onSelect={(entry) => {
                input.setText(entry.input)
                setStore("prompt", { input: entry.input, parts: entry.parts })
                restoreExtmarksFromParts(entry.parts)
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
    ].map((entry) => ({
      namespace: "palette",
      ...entry,
    })),
  )

  useBindings(() => ({
    commands: stashCommands(),
  }))

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && !vimMode.isNormal(),
      bindings: tuiConfig.keybinds.get("prompt.paste"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && !vimMode.isNormal() && store.prompt.input !== "",
      bindings: tuiConfig.keybinds.get("prompt.clear"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return (
          inputTarget() !== undefined &&
          !props.disabled &&
          !vimMode.isNormal() &&
          store.mode === "normal" &&
          !auto()?.visible &&
          input?.visualCursor.offset === 0
        )
      })(),
      bindings: [
        {
          key: "!",
          desc: "Shell mode",
          group: "Prompt",
          cmd: () => {
            setStore("placeholder", randomIndex(shell().length))
            setStore("mode", "shell")
          },
        },
      ],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !vimMode.isNormal() && store.mode === "shell",
      bindings: [{ key: "escape", desc: "Exit shell mode", group: "Prompt", cmd: () => setStore("mode", "normal") }],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !vimMode.isNormal() && store.mode === "shell" && input?.visualCursor.offset === 0
      })(),
      bindings: [{ key: "backspace", desc: "Exit shell mode", group: "Prompt", cmd: () => setStore("mode", "normal") }],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !props.disabled && !vimMode.isNormal() && !auto()?.visible && input !== undefined
      })(),
      commands: [
        {
          name: "prompt.history.previous",
          title: "Previous prompt history",
          category: "Prompt",
          run() {
            if (input.cursorOffset !== 0) {
              if (input.scrollY + input.visualCursor.visualRow === 0) input.cursorOffset = 0
              return false
            }

            if (!input.plainText && props.onUpWhenEmpty) {
              props.onUpWhenEmpty()
              return false
            }

            const item = history.move(-1, input.plainText)
            if (!item) return false
            input.setText(item.input)
            setStore("prompt", item)
            setStore("mode", item.mode ?? "normal")
            restoreExtmarksFromParts(item.parts)
            input.cursorOffset = 0
          },
        },
      ],
      bindings: tuiConfig.keybinds.get("prompt.history.previous"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !props.disabled && !vimMode.isNormal() && !auto()?.visible && input !== undefined
      })(),
      commands: [
        {
          name: "prompt.history.next",
          title: "Next prompt history",
          category: "Prompt",
          run() {
            if (input.cursorOffset !== input.plainText.length) {
              if (
                input.scrollY + input.visualCursor.visualRow ===
                Math.max(0, input.editorView.getTotalVirtualLineCount() - 1)
              )
                input.cursorOffset = input.plainText.length
              return false
            }

            if (!input.plainText && props.onDownWhenEmpty) {
              props.onDownWhenEmpty()
              return false
            }

            const item = history.move(1, input.plainText)
            if (!item) return false
            input.setText(item.input)
            setStore("prompt", item)
            setStore("mode", item.mode ?? "normal")
            restoreExtmarksFromParts(item.parts)
            input.cursorOffset = input.plainText.length
          },
        },
      ],
      bindings: tuiConfig.keybinds.get("prompt.history.next"),
    }
  })

  let submitting = false
  async function submit() {
    // Prevent overlapping invocations (e.g. a double-pressed Enter, or the
    // input's native onSubmit racing another dispatch). Without this guard,
    // a second call slips past the empty-input check before the first call
    // clears `store.prompt.input`, then awaits its own `session.create` and
    // ultimately reads the now-empty store — sending a phantom empty prompt
    // to a freshly created session.
    if (submitting) return false
    submitting = true
    try {
      return await submitInner()
    } finally {
      submitting = false
    }
  }

  async function submitInner() {
    setWarpNotice(undefined)

    // IME: double-defer may fire before onContentChange flushes the last
    // composed character (e.g. Korean hangul) to the store, so read
    // plainText directly and sync before any downstream reads.
    if (input && !input.isDestroyed && input.plainText !== store.prompt.input) {
      setStore("prompt", "input", input.plainText)
      syncExtmarksWithPromptParts()
    }
    if (props.disabled) return false
    if (workspaceCreating()) return false
    if (auto()?.visible) return false
    if (!store.prompt.input) {
      if (props.onEnterEmpty) return !!props.onEnterEmpty()
      return false
    }
    const agent = local.agent.current()
    if (!agent) return false
    const trimmed = store.prompt.input.trim()
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      destroyRenderer(renderer)
      return true
    }
    const selectedModel = local.model.current()
    if (!selectedModel) {
      void promptModelWarning()
      return false
    }

    const workspaceSession = props.sessionID ? sync.session.get(props.sessionID) : undefined
    const workspaceID = workspaceSession?.workspaceID
    const workspaceStatus = workspaceID ? (project.workspace.status(workspaceID) ?? "error") : undefined
    if (props.sessionID && workspaceID && workspaceStatus !== "connected") {
      dialog.replace(() => (
        <DialogWorkspaceUnavailable
          onRestore={() => {
            void openWorkspaceSelect({
              dialog,
              sdk,
              sync,
              project,
              toast,
              onSelect: (selection) => {
                void warpSession(selection)
              },
            })
            return false
          }}
        />
      ))
      return false
    }

    const variant = local.model.variant.current()
    let sessionID = props.sessionID
    if (sessionID == null) {
      const workspace = workspaceSelection()
      const workspaceID = iife(() => {
        if (!workspace) return undefined
        if (workspace.type === "none") return undefined
        if (workspace.type === "existing") return workspace.workspaceID
        return undefined
      })

      const res = await sdk.client.session.create({
        workspace: workspaceID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          id: selectedModel.modelID,
          variant,
        },
      })

      if (res.error) {
        console.log("Creating a session failed:", res.error)

        toast.show({
          message: "Creating a session failed. Open console for more details.",
          variant: "error",
        })

        return true
      }

      sessionID = res.data.id
    }

    const messageID = MessageID.ascending()
    let inputText = store.prompt.input

    // Expand pasted text inline before submitting
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    const sortedExtmarks = allExtmarks.sort((a: { start: number }, b: { start: number }) => b.start - a.start)

    for (const extmark of sortedExtmarks) {
      const partIndex = store.extmarkToPartIndex.get(extmark.id)
      if (partIndex !== undefined) {
        const part = store.prompt.parts[partIndex]
        if (part?.type === "text" && part.text) {
          const before = inputText.slice(0, extmark.start)
          const after = inputText.slice(extmark.end)
          inputText = before + part.text + after
        }
      }
    }

    // Filter out text parts (pasted content) since they're now expanded inline
    const nonTextParts = store.prompt.parts.filter((part) => part.type !== "text")

    // Capture mode before it gets reset
    const currentMode = store.mode
    const editorSelection = editorContext()
    const editorParts =
      editorSelection && editor.labelState() === "pending"
        ? [
            {
              id: PartID.ascending(),
              type: "text" as const,
              text: formatEditorContext(editorSelection),
              synthetic: true,
              metadata: {
                kind: "editor_context",
                source: editorSelection.source ?? "editor",
                filePath: editorSelection.filePath,
                ranges: editorSelection.ranges,
              },
            },
          ]
        : []

    if (store.mode === "shell") {
      void sdk.client.session.shell({
        sessionID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        command: inputText,
      })
      setStore("mode", "normal")
    } else if (
      inputText.startsWith("/") &&
      iife(() => {
        const firstLine = inputText.split("\n")[0]
        const command = firstLine.split(" ")[0].slice(1)
        return sync.data.command.some((x) => x.name === command)
      })
    ) {
      // Parse command from first line, preserve multi-line content in arguments
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [command, ...firstLineArgs] = firstLine.split(" ")
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")

      void sdk.client.session.command({
        sessionID,
        command: command.slice(1),
        arguments: args,
        agent: agent.name,
        model: `${selectedModel.providerID}/${selectedModel.modelID}`,
        messageID,
        variant,
        parts: nonTextParts
          .filter((x) => x.type === "file")
          .map((x) => ({
            id: PartID.ascending(),
            ...x,
          })),
      })
    } else {
      sdk.client.session
        .prompt({
          sessionID,
          ...selectedModel,
          messageID,
          agent: agent.name,
          model: selectedModel,
          variant,
          parts: [
            ...editorParts,
            {
              id: PartID.ascending(),
              type: "text",
              text: inputText,
            },
            ...nonTextParts,
          ],
        })
        .catch(() => {})
      if (editorParts.length > 0) editor.markSelectionSent()
    }
    history.append({
      ...store.prompt,
      mode: currentMode,
    })
    input.extmarks.clear()
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
    props.onSubmit?.()

    // temporary hack to make sure the message is sent
    if (!props.sessionID) {
      if (editorParts.length > 0) editor.preserveSelectionFromNewSession()
      setTimeout(() => {
        route.navigate({
          type: "session",
          sessionID,
        })
      }, 50)
    }
    input.clear()
    return true
  }
  function pasteText(text: string, virtualText: string) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const extmarkEnd = extmarkStart + virtualText.length

    input.insertText(virtualText + " ")

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push({
          type: "text" as const,
          text,
          source: {
            text: {
              start: extmarkStart,
              end: extmarkEnd,
              value: virtualText,
            },
          },
        })
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
  }

  async function pasteInputText(text: string) {
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const pastedContent = normalizedText.trim()
    const filepath = iife(() => {
      const raw = pastedContent.replace(/^['"]+|['"]+$/g, "")
      if (raw.startsWith("file://")) {
        try {
          return fileURLToPath(raw)
        } catch {}
      }
      if (process.platform === "win32") return raw
      return raw.replace(/\\(.)/g, "$1")
    })
    const isUrl = /^(https?):\/\//.test(filepath)
    if (!isUrl) {
      try {
        const mime = await Filesystem.mimeType(filepath)
        const filename = path.basename(filepath)
        if (mime === "image/svg+xml") {
          const content = await Filesystem.readText(filepath).catch(() => {})
          if (content) {
            pasteText(content, `[SVG: ${filename ?? "image"}]`)
            return
          }
        }
        if (mime.startsWith("image/") || mime === "application/pdf") {
          const content = await Filesystem.readArrayBuffer(filepath)
            .then((buffer) => Buffer.from(buffer).toString("base64"))
            .catch(() => {})
          if (content) {
            await pasteAttachment({
              filename,
              filepath,
              mime,
              content,
            })
            return
          }
        }
      } catch {}
    }

    const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1
    if (
      (lineCount >= 3 || pastedContent.length > 150) &&
      kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary)
    ) {
      pasteText(pastedContent, `[Pasted ~${lineCount} lines]`)
      return
    }

    input.insertText(normalizedText)

    setTimeout(() => {
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      renderer.requestRender()
    }, 0)
  }

  async function pasteAttachment(file: { filename?: string; filepath?: string; content: string; mime: string }) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const pdf = file.mime === "application/pdf"
    const count = store.prompt.parts.filter((x) => {
      if (x.type !== "file") return false
      if (pdf) return x.mime === "application/pdf"
      return x.mime.startsWith("image/")
    }).length
    const virtualText = pdf ? `[PDF ${count + 1}]` : `[Image ${count + 1}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    const part: Omit<FilePart, "id" | "messageID" | "sessionID"> = {
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: `data:${file.mime};base64,${file.content}`,
      source: {
        type: "file",
        path: file.filepath ?? file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText,
        },
      },
    }
    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push(part)
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
    return
  }

  function clearPrompt() {
    if (store.prompt.input.trim().length >= DRAFT_RETENTION_MIN_CHARS || store.prompt.parts.length > 0) {
      history.append({
        ...store.prompt,
        mode: store.mode,
      })
    }
    input.clear()
    input.extmarks.clear()
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
  }

  const highlight = createMemo(() => {
    if (isLeaderActive()) return theme.warning
    if (store.mode === "shell") return theme.primary
    const agent = local.agent.current()
    if (!agent) return theme.border
    return local.agent.color(agent.name)
  })

  const showVariant = createMemo(() => {
    const variants = local.model.variant.list()
    if (variants.length === 0) return false
    const current = local.model.variant.current()
    return !!current
  })

  const agentMetaAlpha = createFadeIn(() => !!local.agent.current(), animationsEnabled)
  const modelMetaAlpha = createFadeIn(() => !!local.agent.current() && store.mode === "normal", animationsEnabled)
  const variantMetaAlpha = createFadeIn(
    () => !!local.agent.current() && store.mode === "normal" && showVariant(),
    animationsEnabled,
  )
  const borderHighlight = createMemo(() => tint(theme.border, highlight(), agentMetaAlpha()))

  const placeholderText = createMemo(() => {
    if (props.showPlaceholder === false) return undefined
    if (store.mode === "shell") {
      if (!shell().length) return undefined
      const example = shell()[store.placeholder % shell().length]
      return `Run a command... "${example}"`
    }
    if (!list().length) return undefined
    return `Ask anything... "${list()[store.placeholder % list().length]}"`
  })

  const workspaceLabel = createMemo<
    | { type: "new"; workspaceType: string }
    | { type: "existing"; workspaceType: string; workspaceName: string; status?: WorkspaceStatus }
    | undefined
  >(() => {
    const selected = workspaceSelection()
    if (!selected) return
    if (selected.type === "none") return
    if (props.sessionID && !workspaceCreating()) return
    if (selected.type === "new") {
      return {
        type: "new",
        workspaceType: selected.workspaceType,
      }
    }
    return {
      type: "existing",
      workspaceType: selected.workspaceType,
      workspaceName: selected.workspaceName,
      status: selected.type === "existing" ? "connected" : undefined,
    }
  })

  const activityColor = createMemo(() => {
    const agent =
      status().type !== "idle"
        ? (local.agent.list().find((a) => a.name === lastUserMessage()?.agent) ?? local.agent.current())
        : local.agent.current()
    return agent ? local.agent.color(agent.name) : theme.border
  })
  const activityDot = createMemo(() => {
    if (!kv.get("animations_enabled", true)) return "●"
    return activityFrame() === 0 ? "●" : "○"
  })

  return (
    <>
      <box visible={props.visible !== false}>
        <box
          ref={(r: BoxRenderable) => (anchor = r)}
          border={props.compact ? [] : ["left"]}
          borderColor={borderHighlight()}
          customBorderChars={{
            ...SplitBorder.customBorderChars,
            bottomLeft: props.compact ? "" : "╹",
          }}
        >
          <box
            paddingLeft={props.compact ? 0 : 2}
            paddingRight={props.compact ? 0 : 2}
            paddingTop={props.compact ? 0 : 1}
            flexShrink={0}
            flexGrow={1}
          >
            <Show when={!props.compact}>
              <box flexDirection="row" flexShrink={0} paddingTop={props.compact ? 0 : 1} gap={1} justifyContent="space-between">
                <box flexDirection="row" gap={1}>
                  <Show when={props.compact}>
                    <text fg={theme.textMuted}>
                      {vimMode.isNormal() ? "NORMAL" : "INSERT"}
                    </text>
                  </Show>
                  <Show when={local.agent.current()} fallback={<box height={1} />}>
                    {(agent) => (
                      <>
                        <Show when={props.compact}>
                          <text fg={fadeColor(theme.textMuted, agentMetaAlpha())}>·</text>
                        </Show>
                        <text fg={fadeColor(highlight(), agentMetaAlpha())}>
                          {store.mode === "shell" ? "Shell" : Locale.titlecase(agent().name)}
                        </text>
                        <Show when={store.mode === "normal"}>
                          <box flexDirection="row" gap={1}>
                            <text fg={fadeColor(theme.textMuted, modelMetaAlpha())}>·</text>
                            <text
                              flexShrink={0}
                              fg={fadeColor(theme.text, modelMetaAlpha())}
                            >
                              {directory()}
                            </text>
                            <Show when={isLeaderActive()}>
                              <text fg={fadeColor(theme.textMuted, modelMetaAlpha())}>·</text>
                              <text fg={theme.warning}>
                                <span style={{ bold: true }}>⚡ LEADER</span>
                              </text>
                            </Show>
                            <Show when={showVariant()}>
                              <text fg={fadeColor(theme.textMuted, variantMetaAlpha())}>·</text>
                              <text>
                                <span style={{ fg: fadeColor(theme.warning, variantMetaAlpha()), bold: true }}>
                                  {local.model.variant.current()}
                                </span>
                              </text>
                            </Show>
                            <Show when={usage()}>
                              {(item) => (
                                <>
                                  <text fg={theme.textMuted}>·</text>
                                  <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
                                    {[item().context, item().cost].filter(Boolean).join(" · ")}
                                  </text>
                                </>
                              )}
                            </Show>
                          </box>
                        </Show>
                      </>
                    )}
                  </Show>
                </box>
                <Show when={hasRightContent()}>
                  <box flexDirection="row" gap={1} alignItems="center">
                    {props.right}
                  </box>
                </Show>
              </box>
            </Show>
            <Show when={isLeaderActive()}>
              <box
                position="absolute"
                bottom={2}
                right={0}
                marginRight={1}
                width={leaderMenuWidth()}
                flexDirection="column"
                backgroundColor={"#111111"}
                border={["top", "bottom", "left", "right"]}
                borderColor={RGBA.fromInts(255, 255, 255, 255)}
                paddingTop={1}
                paddingRight={2}
                paddingBottom={1}
                paddingLeft={2}
              >
                <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
                  <text fg={RGBA.fromInts(255, 255, 255, 255)} attributes={TextAttributes.BOLD}>
                    {leaderMenuTitle()}
                  </text>
                  <text fg={theme.textMuted}>{leaderMenuSubtitle()}</text>
                </box>
                <For each={leaderMenuDynamicItems()}>
                  {(item) => (
                    isSeparator(item) ? (
                      <box marginY={0} paddingTop={0} paddingBottom={0}>
                        <text fg={theme.textMuted} wrapMode="none">{"─".repeat(leaderMenuWidth() - 4)}</text>
                      </box>
                    ) : (
                      <box 
                        flexDirection="row" 
                        gap={1} 
                        width="100%"
                        backgroundColor={item.key === selectedItem()?.key ? RGBA.fromInts(40, 40, 40, 255) : undefined}
                      >
                        <text fg={theme.warning} attributes={TextAttributes.BOLD}>
                          {item.key}
                        </text>
                        <text fg={theme.textMuted}>→</text>
                        {"icon" in item && item.icon ? (
                          <text fg={theme.accent}>{item.icon}</text>
                        ) : null}
                        <text
                          fg={"items" in item ? theme.accent : theme.text}
                          attributes={"items" in item ? TextAttributes.BOLD : undefined}
                          wrapMode="none"
                          truncate
                        >
                          {"items" in item ? `+${item.label}` : item.label}
                        </text>
                      </box>
                    )
                  )}
                </For>
                <box marginTop={1} flexDirection="row" justifyContent="space-between">
                  <text fg={theme.textMuted}>
                    {leaderActiveGroup() ? "backspace back" : "esc close"}
                  </text>
                  <text fg={theme.textMuted}>
                    {leaderActiveGroup() ? "esc close" : "space leader"}
                  </text>
                </box>
              </box>
            </Show>
            <Show when={props.compact && status().type !== "idle"}>
              <box width="100%" flexDirection="row" justifyContent="space-between">
                <box flexShrink={0} flexDirection="row" gap={1}>
                  <box marginLeft={1}>
                    <text fg={activityColor()}>{activityDot()}</text>
                  </box>
                  <text fg={theme.textMuted}>Thinking</text>
                </box>
                <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                  esc{" "}
                  <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                    {store.interrupt > 0 ? "again to interrupt" : "interrupt"}
                  </span>
                </text>
              </box>
            </Show>
            <box visible={!vimMode.isNormal() || isLeaderActive() || !vimHidePrompt()} flexDirection="row" alignItems="flex-start" backgroundColor={"#2a2a2a"} width="100%">
              <textarea
                placeholder={props.compact ? undefined : placeholderText()}
                placeholderColor={theme.textMuted}
                textColor={theme.text}
                focusedTextColor={theme.text}
                flexGrow={1}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                const value = input.plainText
                setStore("prompt", "input", value)
                auto()?.onInput(value)
                syncExtmarksWithPromptParts()
                setCursorVersion((value) => value + 1)
              }}
              onCursorChange={() => setCursorVersion((value) => value + 1)}
              onKeyDown={(e: { preventDefault(): void }) => {
                if (props.disabled || isLeaderActive() || vimMode.isNormal()) {
                  e.preventDefault()
                  return
                }
              }}
              onSubmit={() => {
                if (vimMode.isNormal()) return
                // IME: double-defer so the last composed character (e.g. Korean
                // hangul) is flushed to plainText before we read it for submission.
                setTimeout(() => setTimeout(() => submit(), 0), 0)
              }}
              onPaste={async (event: PasteEvent) => {
                if (props.disabled || vimMode.isNormal()) {
                  event.preventDefault()
                  return
                }

                // Normalize line endings at the boundary
                // Windows ConPTY/Terminal often sends CR-only newlines in bracketed paste
                // Replace CRLF first, then any remaining CR
                const normalizedText = decodePasteBytes(event.bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                const pastedContent = normalizedText.trim()

                // Windows Terminal <1.25 can surface image-only clipboard as an
                // empty bracketed paste. Windows Terminal 1.25+ does not.
                if (!pastedContent) {
                  keymap.dispatchCommand("prompt.paste")
                  return
                }

                // Once we cross an async boundary below, the terminal may perform its
                // default paste unless we suppress it first and handle insertion ourselves.
                event.preventDefault()

                await pasteInputText(normalizedText)
              }}
              ref={(r: TextareaRenderable) => {
                input = r
                Object.assign(r, {
                  getClipboardText: (text: string) => expandPastedTextPlaceholders(text, store.prompt.parts),
                })
                setInputTarget(r)
                if (promptPartTypeId === 0) {
                  promptPartTypeId = input.extmarks.registerType("prompt-part")
                }
                props.ref?.(ref)
                setTimeout(() => {
                  // setTimeout is a workaround and needs to be addressed properly
                  if (!input || input.isDestroyed) return
                  input.cursorColor = theme.text
                }, 0)
              }}
              onMouseDown={(r: MouseEvent) => {
                if (vimMode.isNormal()) {
                  r.preventDefault()
                  return
                }
                r.target?.focus()
              }}
              cursorColor={props.disabled ? theme.backgroundElement : theme.text}
              syntaxStyle={syntax()}
            />
            </box>
          </box>
        </box>
        <Show when={!props.compact}>
          <box
            height={1}
            border={["left"]}
            borderColor={borderHighlight()}
            customBorderChars={{
              ...EmptyBorder,
              vertical: theme.backgroundElement.a !== 0 ? "╹" : " ",
            }}
          >
            <box
              height={1}
              border={["bottom"]}
              borderColor={theme.backgroundElement}
              customBorderChars={
                theme.backgroundElement.a !== 0
                  ? {
                      ...EmptyBorder,
                      horizontal: "▀",
                    }
                  : {
                      ...EmptyBorder,
                      horizontal: " ",
                    }
              }
            />
          </box>
        </Show>
        <Show when={!props.compact}>
          <box width="100%" flexDirection="row" justifyContent="space-between">
            <Switch>
              <Match when={status().type !== "idle"}>
              <box
                flexDirection="row"
                gap={1}
                flexGrow={1}
                justifyContent={status().type === "retry" ? "space-between" : "flex-start"}
              >
                <box flexShrink={0} flexDirection="row" gap={1}>
                  <box marginLeft={1}>
                    <text fg={activityColor()}>{activityDot()}</text>
                  </box>
                  <box flexDirection="row" gap={1} flexShrink={0}>
                    <text fg={theme.textMuted}>Thinking</text>
                    {(() => {
                      const retry = createMemo(() => {
                        const s = status()
                        if (s.type !== "retry") return
                        return s
                      })
                      const message = createMemo(() => {
                        const r = retry()
                        if (!r) return
                        if (r.message.includes("exceeded your current quota") && r.message.includes("gemini"))
                          return "gemini is way too hot right now"
                        if (r.message.length > 80) return r.message.slice(0, 80) + "..."
                        return r.message
                      })
                      const isTruncated = createMemo(() => {
                        const r = retry()
                        if (!r) return false
                        return r.message.length > 120
                      })
                      const [seconds, setSeconds] = createSignal(0)
                      onMount(() => {
                        const timer = setInterval(() => {
                          const next = retry()?.next
                          if (next) setSeconds(Math.round((next - Date.now()) / 1000))
                        }, 1000)

                        onCleanup(() => {
                          clearInterval(timer)
                        })
                      })
                      const handleMessageClick = () => {
                        const r = retry()
                        if (!r) return
                        if (isTruncated()) {
                          void DialogAlert.show(dialog, "Retry Error", r.message)
                        }
                      }

                      const retryText = () => {
                        const r = retry()
                        if (!r) return ""
                        const baseMessage = message()
                        const truncatedHint = isTruncated() ? " (click to expand)" : ""
                        const duration = formatDuration(seconds())
                        const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`
                        return baseMessage + truncatedHint + retryInfo
                      }

                      return (
                        <Show when={retry()}>
                          <box onMouseUp={handleMessageClick}>
                            <text fg={theme.error}>{retryText()}</text>
                          </box>
                        </Show>
                      )
                    })()}
                  </box>
                </box>
                <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                  esc{" "}
                  <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                    {store.interrupt > 0 ? "again to interrupt" : "interrupt"}
                  </span>
                </text>
              </box>
            </Match>
            <Match when={warpNotice()}>
              {(notice) => (
                <box paddingLeft={3}>
                  <text fg={theme.accent}>{notice()}</text>
                </box>
              )}
            </Match>
            <Match when={workspaceLabel()}>
              {(workspace) => (
                <box paddingLeft={3} flexDirection="row" gap={1}>
                  <Show when={workspaceCreating()}>
                    <Spinner color={theme.accent} />
                  </Show>
                  <text fg={workspaceCreating() ? theme.accent : theme.text}>
                    {(() => {
                      const item = workspace()
                      if (item.type === "new") {
                        if (workspaceCreating())
                          return `Creating ${item.workspaceType}${".".repeat(workspaceCreatingDots())}`
                        return (
                          <>
                            Workspace <span style={{ fg: theme.textMuted }}>(new {item.workspaceType})</span>
                          </>
                        )
                      }
                      return (
                        <>
                          Workspace <span style={{ fg: theme.textMuted }}>{item.workspaceName}</span>
                        </>
                      )
                    })()}
                  </text>
                </box>
              )}
            </Match>
            <Match when={true}>{props.hint ?? <text />}</Match>
          </Switch>
          <Show when={status().type !== "retry"}>
            <box gap={2} flexDirection="row">
              <Show when={editorContextLabelState() !== "none" ? editorFileLabelDisplay() : undefined}>
                {(file) => (
                  <text fg={editorContextLabelState() === "pending" ? theme.secondary : theme.textMuted}>{file()}</text>
                )}
              </Show>
              <Switch>
                <Match when={store.mode === "normal"}>
                  <Show when={isLeaderActive()}>
                    <text fg={theme.warning} wrapMode="none" truncate>
                      {leaderMenuHint()}
                    </text>
                  </Show>
                  <Show when={!isLeaderActive() && !props.compact}>
                    <text fg={theme.text}>
                      {agentShortcut()} <span style={{ fg: theme.textMuted }}>agents</span>
                    </text>
                  </Show>
                  <Show when={!isLeaderActive() && !props.compact}>
                    <text fg={theme.text}>
                      {paletteShortcut()} <span style={{ fg: theme.textMuted }}>commands</span>
                    </text>
                  </Show>
                </Match>
                <Match when={store.mode === "shell"}>
                  <text fg={theme.text}>
                    esc <span style={{ fg: theme.textMuted }}>exit shell mode</span>
                  </text>
                </Match>
              </Switch>
            </box>
          </Show>
          </box>
        </Show>
      </box>
    </>
  )
}
