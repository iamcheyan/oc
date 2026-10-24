import {
  BoxRenderable,
  RGBA,
  TextAttributes,
  TextareaRenderable,
  MouseEvent,
  PasteEvent,
  decodePasteBytes,
  type KeyEvent,
} from "@opentui/core"
import { createEffect, createMemo, onMount, createSignal, onCleanup, on, Show, Switch, Match, For } from "solid-js"
import path from "path"
import { useLocal } from "../../../tui/src/context/local"
import { tint, useForkTheme } from "../util/theme"
import { EmptyBorder, SplitBorder } from "../../../tui/src/ui/border"
import { useClient } from "../../../tui/src/context/client"
import { useRoute } from "../../../tui/src/context/route"
import { useEvent } from "../../../tui/src/context/event"
import { editorSelectionKey, useEditorContext, type EditorSelection } from "../../../tui/src/context/editor"
import { createStore, produce, unwrap } from "solid-js/store"
import { usePromptHistory, type PromptInfo, type PromptPartRef } from "../../../tui/src/prompt/history"
import { computePromptTraits } from "../../../tui/src/prompt/traits"
import { expandPastedTextPlaceholders } from "../../../tui/src/prompt/part"
import { usePromptStash } from "../../../tui/src/prompt/stash"
import { DialogStash } from "../../../tui/src/component/dialog-stash"
import { type AutocompleteRef } from "./autocomplete"
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import { openEditor } from "../../../tui/src/editor"
import { Locale } from "../util/locale"
import { useDialog } from "../../../tui/src/ui/dialog"
import { useToast } from "../../../tui/src/ui/toast"
import { createFadeIn } from "../../../tui/src/util/signal"
import { DialogSkill } from "./dialog-skill"
import { useConfig } from "../../../tui/src/config/index"
import { useClipboard } from "../../../tui/src/context/clipboard"
import { useData } from "../../../tui/src/context/data"
import { useLocation } from "../../../tui/src/context/location"
import { usePromptRef } from "../../../tui/src/context/prompt"
import { Keymap } from "../../../tui/src/context/keymap"
import { useTuiPaths } from "../../../tui/src/context/runtime"
import { useAutocompleteHost } from "../context/autocomplete-host"
import type { KeymapCommand } from "../../../tui/src/context/keymap"
import { useVimMode } from "../feature/vim-mode"
import { getLeaderMenu, isSeparator, type LeaderGroup, type LeaderLeaf, type LeaderSeparator } from "../feature/leader-menu"
import { loadVimConfig } from "../config/vim"

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
  mode: "normal" | "shell"
  setMode(mode: "normal" | "shell"): void
  submit(): void
}

export type MinimalPromptRef = PromptRef & {
  insert(text: string): void
  interrupt(): void
}

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

let stashed: { prompt: PromptInfo; cursor: number } | undefined

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable
  const [inputTarget, setInputTarget] = createSignal<TextareaRenderable | undefined>()

  const vimMode = useVimMode()
  const paths = useTuiPaths()
  const location = useLocation()
  const local = useLocal()
  const promptRef = usePromptRef()
  const editor = useEditorContext()
  const route = useRoute()
  const client = useClient()
  const data = useData()
  const clipboard = useClipboard()
  const config = useConfig().data
  const dialog = useDialog()
  const toast = useToast()
  const vimConfig = createMemo(() => loadVimConfig(location.current?.directory ?? paths.cwd))
  const vimHidePrompt = createMemo(() => vimConfig().hidePrompt ?? false)
  const vimAutoResume = createMemo(() => vimConfig().autoResume ?? false)
  const leaderMenu = createMemo(() => props.menu ?? getLeaderMenu(paths.cwd))
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
          const isShowing = false
          label = isShowing ? "hide thinking" : "show thinking"
          icon = isShowing ? "" : ""
        } else if (item.command === "session.sidebar.toggle") {
          const isShowing = false
          label = isShowing ? "hide sidebar" : "show sidebar"
          icon = isShowing ? "" : ""
        } else if (item.command === "vim.toggle.autoAllowPermissions") {
          const isAuto = vimConfig().autoAllowPermissions ?? false
          label = isAuto ? "ask for permissions" : "auto-allow all"
          icon = isAuto ? "" : ""
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
  const status = createMemo(() => data.session.status(props.sessionID ?? ""))
  const running = createMemo(() => status() === "running")
  const [activityFrame, setActivityFrame] = createSignal(0)
  createEffect(() => {
    if (status() === "idle") {
      setActivityFrame(0)
      return
    }
    const timer = setInterval(() => setActivityFrame((i) => (i + 1) % 2), 500)
    onCleanup(() => clearInterval(timer))
  })
  const history = usePromptHistory()
  const stash = usePromptStash()
  const keymap = Keymap.use()
  const shortcuts = Keymap.useShortcuts()
  const agentShortcut = () => shortcuts.get("agent.cycle")
  const paletteShortcut = () => shortcuts.get("command.palette.show")
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const animationsEnabled = createMemo(() => config.animations ?? true)
  const list = createMemo(() => props.placeholders?.normal ?? [])
  const shell = createMemo(() => props.placeholders?.shell ?? [])
  const fileContextEnabled = createMemo(() => config.prompt?.editor ?? true)
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
  const [cursorVersion, setCursorVersion] = createSignal(0)
  const hasRightContent = createMemo(() => Boolean(props.right))
  const autocompleteHost = useAutocompleteHost()

  function promptModelWarning() {
    toast.show({ variant: "warning", message: "Connect an integration to send prompts", duration: 3000 })
  }

  function dismissEditorContext() {
    setDismissedEditorSelectionKey(editorSelectionKey(editorContext()))
    editor.clearSelection()
  }
  const { theme, syntax } = useForkTheme()
  const fileStyleId = () => syntax().getStyleId("extmark.file")!
  const agentStyleId = () => syntax().getStyleId("extmark.agent")!
  const pasteStyleId = () => syntax().getStyleId("extmark.paste")!
  let promptPartTypeId = 0
  const event = useEvent()

  event.on("tui.prompt.append", (evt, { directory }) => {
    if (directory !== (location.current?.directory ?? data.location.default().directory)) return
    if (!input || input.isDestroyed) return
    input.insertText(evt.data.text)
    setTimeout(() => {
      // setTimeout is a workaround and needs to be addressed properly
      if (!input || input.isDestroyed) return
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    input.cursorColor = props.disabled ? theme.background.raised.base : theme.text.base
  })

  const [store, setStore] = createStore<{
    prompt: PromptInfo
    mode: "normal" | "shell"
    extmarkToPartIndex: Map<number, PromptPartRef>
    interrupt: number
    placeholder: number
  }>({
    placeholder: randomIndex(list().length),
    prompt: {
      text: "",
      files: [],
      agents: [],
      skills: [],
      pasted: [],
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

  const promptCommands = createMemo<KeymapCommand[]>(() =>
    [
      {
        title: "Clear prompt",
        id: "prompt.clear",
        group: "Prompt",
          run: () => {
          clearPrompt()
          dialog.clear()
        },
      },
      {
        title: "Submit prompt",
        id: "prompt.submit",
        group: "Prompt",
          run: async () => {
          if (!input.focused) return
          const handled = await submit()
          if (!handled) return

          dialog.clear()
        },
      },
      {
        title: "Remove editor context",
        id: "prompt.editor_context.clear",
        group: "Prompt",
        enabled: Boolean(editorContext()),
        run: () => {
          dismissEditorContext()
          dialog.clear()
        },
      },
      {
        title: "Paste",
        id: "prompt.paste",
        group: "Prompt",
          run: async (_input?: string, event?: KeyEvent) => {
          event?.preventDefault()
          event?.stopPropagation()
          const content = await clipboard.read()
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
        id: "session.interrupt",
        group: "Session",
          enabled: running(),
        run: () => {
          if (!input.focused) return
          ref.interrupt()
        },
      },
      {
        title: "Open editor",
        group: "Session",
        id: "prompt.editor",
        slash: { name: "editor" },
        run: async () => {
          dialog.clear()

          const text = store.prompt.text
          const content = await openEditor({ value: text, renderer })
          if (!content) return

          input.setText(content)
      const restoredFiles = store.prompt.files?.map((part) => {
        const mention = part.mention
        if (!mention) return part
        const start = content.indexOf(mention.text)
        return start < 0 ? undefined : { ...part, mention: { ...mention, start, end: start + mention.text.length } }
      }).filter((part) => part !== undefined)
      const restoredAgents = store.prompt.agents?.map((part) => {
        const mention = part.mention
        if (!mention) return part
        const start = content.indexOf(mention.text)
        return start < 0 ? undefined : { ...part, mention: { ...mention, start, end: start + mention.text.length } }
      }).filter((part) => part !== undefined)
      const restoredPasted = store.prompt.pasted.map((part) => {
        const start = content.indexOf(part.source.text)
        return start < 0 ? undefined : { ...part, source: { ...part.source, start, end: start + part.source.text.length } }
      }).filter((part) => part !== undefined)
      const updated: PromptInfo = { ...store.prompt, text: content, files: restoredFiles, agents: restoredAgents, pasted: restoredPasted }
          setStore("prompt", updated)
          restoreExtmarksFromPrompt(updated)
          input.cursorOffset = Bun.stringWidth(content)
        },
      },
      {
        title: "Skills",
        id: "prompt.skills",
        group: "Prompt",
        slash: { name: "skills" },
        run: () => {
          const skillFilter = (globalThis as any).__SKILL_FILTER__
          delete (globalThis as any).__SKILL_FILTER__
          dialog.replace(() => (
            <DialogSkill
              initialFilter={skillFilter}
              onSelect={(skill) => {
                input.setText(`/${skill} `)
          setStore("prompt", { text: `/${skill} `, files: [], agents: [], skills: [], pasted: [] })
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
    ].map((entry) => ({ ...entry, palette: true as const } as KeymapCommand)),
  )

  Keymap.createLayer(() => ({ mode: "global", commands: promptCommands() }))

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
    get mode() {
      return store.mode
    },
    setMode(mode) {
      setStore("mode", mode)
    },
    focus() {
      if (vimMode.isNormal()) return
      input.focus()
    },
    blur() {
      input.blur()
    },
    set(prompt) {
      input.setText(prompt.text)
      setStore("prompt", prompt)
      restoreExtmarksFromPrompt(prompt)
      input.gotoBufferEnd()
    },
    reset() {
      input.clear()
      input.extmarks.clear()
      setStore("prompt", { text: "", files: [], agents: [], skills: [], pasted: [] })
      setStore("extmarkToPartIndex", new Map())
    },
    insert(text) {
      input.insertText(text)
      setTimeout(() => {
        if (!input || input.isDestroyed) return
        renderer.requestRender()
      }, 0)
    },
    interrupt() {
      if (auto()?.visible) return
      if (store.mode === "shell") {
        setStore("mode", "normal")
        return
      }
      if (!props.sessionID || !running()) return

      setStore("interrupt", store.interrupt + 1)

      setTimeout(() => {
        setStore("interrupt", 0)
      }, 5000)

      if (store.interrupt >= 2) {
        void client.api.session.interrupt({ sessionID: props.sessionID, resume: true })
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
      if (store.prompt.text) return
    if (saved && saved.prompt.text) {
      input.setText(saved.prompt.text)
      setStore("prompt", saved.prompt)
      restoreExtmarksFromPrompt(saved.prompt)
      input.cursorOffset = saved.cursor
    }
  })

  onCleanup(() => {
    if (store.prompt.text) {
      stashed = { prompt: unwrap(store.prompt), cursor: input.cursorOffset }
    }
    setInputTarget(undefined)
    props.ref?.(undefined)
    promptRef.set(undefined)
  })

  createEffect(() => {
    if (!input) return

    const autocompleteProps = {
      sessionID: props.sessionID,
      ref: (r: AutocompleteRef) => {
        setAuto(() => r)
      },
      origin: () => anchor,
      anchor: () => anchor,
      input: () => input,
      setPrompt: (cb: (input: PromptInfo) => void) => {
        setStore("prompt", produce(cb))
      },
      setExtmark: (part: PromptPartRef, extmarkId: number) => {
        setStore("extmarkToPartIndex", (map: Map<number, PromptPartRef>) => new Map(map).set(extmarkId, part))
      },
      value: store.prompt.text,
      fileStyleId: fileStyleId(),
      agentStyleId: agentStyleId(),
      skillStyleId: syntax().getStyleId("extmark.skill")!,
      hasSkill: (id: string) => store.prompt.skills?.some((skill) => skill.id === id) ?? false,
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

  function restoreExtmarksFromPrompt(prompt: PromptInfo) {
    input.extmarks.clear()
    setStore("extmarkToPartIndex", new Map())

    const parts = [
      ...(prompt.files ?? []).map((part, index) => ({ mention: part.mention, ref: { type: "file" as const, index }, styleId: fileStyleId() })),
      ...(prompt.agents ?? []).map((part, index) => ({ mention: part.mention, ref: { type: "agent" as const, index }, styleId: agentStyleId() })),
      ...prompt.pasted.map((part, index) => ({ mention: part.source, ref: { type: "pasted" as const, index }, styleId: pasteStyleId() })),
    ]
    parts.forEach(({ mention, ref, styleId }) => {
      if (!mention?.text) return
      const extmarkId = input.extmarks.create({
        start: mention.start,
        end: mention.end,
        virtual: true,
        styleId,
        typeId: promptPartTypeId,
      })
      setStore("extmarkToPartIndex", (map: Map<number, PromptPartRef>) => new Map(map).set(extmarkId, ref))
    })
  }

  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    setStore(produce((draft) => {
      const newMap = new Map<number, PromptPartRef>()
      const files: NonNullable<PromptInfo["files"]> = []
      const agents: NonNullable<PromptInfo["agents"]> = []
      const pasted: PromptInfo["pasted"] = []
      for (const extmark of allExtmarks) {
        const ref = draft.extmarkToPartIndex.get(extmark.id)
        if (!ref) continue
        if (ref.type === "file") {
          const part = draft.prompt.files?.[ref.index]
          if (!part?.mention) continue
          part.mention.start = extmark.start
          part.mention.end = extmark.end
          const index = files.length
          files.push(part)
          newMap.set(extmark.id, { type: "file", index })
        } else if (ref.type === "agent") {
          const part = draft.prompt.agents?.[ref.index]
          if (!part?.mention) continue
          part.mention.start = extmark.start
          part.mention.end = extmark.end
          const index = agents.length
          agents.push(part)
          newMap.set(extmark.id, { type: "agent", index })
        } else {
          const part = draft.prompt.pasted[ref.index]
          if (!part) continue
          part.source.start = extmark.start
          part.source.end = extmark.end
          const index = pasted.length
          pasted.push(part)
          newMap.set(extmark.id, { type: "pasted", index })
        }
      }
      draft.extmarkToPartIndex = newMap
      draft.prompt.files = files
      draft.prompt.agents = agents
      draft.prompt.pasted = pasted
    }))
  }

  const stashCommands = createMemo(() =>
    [
      {
        title: "Stash prompt",
        id: "prompt.stash",
        group: "Prompt",
        enabled: !!store.prompt.text,
        run: () => {
          if (!store.prompt.text) return
          stash.push({ prompt: store.prompt })
          input.extmarks.clear()
          input.clear()
          setStore("prompt", { text: "", files: [], agents: [], skills: [], pasted: [] })
          setStore("extmarkToPartIndex", new Map())
          dialog.clear()
        },
      },
      {
        title: "Stash pop",
        id: "prompt.stash.pop",
        group: "Prompt",
        enabled: stash.list().length > 0,
        run: () => {
          const entry = stash.pop()
          if (entry) {
            input.setText(entry.prompt.text)
            setStore("prompt", entry.prompt)
            restoreExtmarksFromPrompt(entry.prompt)
            input.gotoBufferEnd()
          }
          dialog.clear()
        },
      },
      {
        title: "Stash list",
        id: "prompt.stash.list",
        group: "Prompt",
        enabled: stash.list().length > 0,
        run: () => {
          dialog.replace(() => (
            <DialogStash
              onSelect={(entry) => {
                input.setText(entry.prompt.text)
                setStore("prompt", entry.prompt)
                restoreExtmarksFromPrompt(entry.prompt)
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
    ].map((entry) => ({ ...entry, palette: true as const } as KeymapCommand)),
  )

  Keymap.createLayer(() => ({ mode: "global", commands: stashCommands() }))

  Keymap.createLayer(() => {
    return {
      priority: 10,
      target: inputTarget,
      enabled: inputTarget() !== undefined && !vimMode.isNormal(),
      commands: [
        {
          id: "vim.normal.escape",
          bind: "escape",
          title: "Enter Normal Mode",
          group: "Vim",
          run: () => {
            enterVimNormalFromEscape()
          },
        },
        {
          id: "vim.normal.ctrl_bracket",
          bind: "ctrl+[",
          title: "Enter Normal Mode",
          group: "Vim",
          run: () => {
            enterVimNormalFromEscape()
          },
        },
      ],
    }
  })

  Keymap.createLayer(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && !vimMode.isNormal(),
      bindings: ["prompt.paste"],
    }
  })

  Keymap.createLayer(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && !vimMode.isNormal() && store.prompt.text !== "",
      bindings: ["prompt.clear"],
    }
  })

  Keymap.createLayer(() => {
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
      commands: [
        {
          bind: "!",
          title: "Shell mode",
          group: "Prompt",
          run: () => {
            setStore("placeholder", randomIndex(shell().length))
            setStore("mode", "shell")
          },
        },
      ],
    }
  })

  Keymap.createLayer(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !vimMode.isNormal() && store.mode === "shell",
      commands: [{ bind: "escape", title: "Exit shell mode", group: "Prompt", run: () => setStore("mode", "normal") }],
    }
  })

  Keymap.createLayer(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !vimMode.isNormal() && store.mode === "shell" && input?.visualCursor.offset === 0
      })(),
      commands: [{ bind: "backspace", title: "Exit shell mode", group: "Prompt", run: () => setStore("mode", "normal") }],
    }
  })

  Keymap.createLayer(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !props.disabled && !vimMode.isNormal() && !auto()?.visible && input !== undefined
      })(),
      commands: [
        {
          id: "prompt.history.previous",
          title: "Previous prompt history",
          group: "Prompt",
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
            input.setText(item.text)
            setStore("prompt", item)
            setStore("mode", item.mode ?? "normal")
            restoreExtmarksFromPrompt(item)
            input.cursorOffset = 0
          },
        },
      ],
      bindings: ["prompt.history.previous"],
    }
  })

  Keymap.createLayer(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !props.disabled && !vimMode.isNormal() && !auto()?.visible && input !== undefined
      })(),
      commands: [
        {
          id: "prompt.history.next",
          title: "Next prompt history",
          group: "Prompt",
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
            input.setText(item.text)
            setStore("prompt", item)
            setStore("mode", item.mode ?? "normal")
            restoreExtmarksFromPrompt(item)
            input.cursorOffset = input.plainText.length
          },
        },
      ],
      bindings: ["prompt.history.next"],
    }
  })



  function enterVimNormalFromEscape(event?: Pick<KeyEvent, "preventDefault" | "stopPropagation">) {
    event?.preventDefault()
    event?.stopPropagation()
    auto()?.hide()
    vimMode.enterNormal()
    setStore("mode", "normal")
    input?.blur()
    inputTarget()?.blur()
  }

  let submitting = false
  async function submit() {
    // Prevent overlapping invocations (e.g. a double-pressed Enter, or the
    // input's native onSubmit racing another dispatch). Without this guard,
    // a second call slips past the empty-input check before the first call
    // clears `store.prompt.text`, then awaits its own `session.create` and
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

    // IME: double-defer may fire before onContentChange flushes the last
    // composed character (e.g. Korean hangul) to the store, so read
    // plainText directly and sync before any downstream reads.
    if (input && !input.isDestroyed && input.plainText !== store.prompt.text) {
      setStore("prompt", "text", input.plainText)
      syncExtmarksWithPromptParts()
    }
    if (props.disabled) return false
    if (auto()?.visible) return false
    if (store.prompt.text.trim() === "" && store.prompt.files?.length === 0 && store.prompt.agents?.length === 0) {
      if (props.onEnterEmpty) return !!props.onEnterEmpty()
      return false
    }
    const agent = local.agent.current()
    if (!agent) return false
    const trimmed = store.prompt.text.trim()
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      process.exit(0)
      return true
    }
    const selectedModel = local.model.current()
    if (!selectedModel) {
      void promptModelWarning()
      return false
    }

    const variant = local.model.variant.current()
    let sessionID = props.sessionID
    if (sessionID == null) {
      const created = data.session.create({ agent: agent.id, location: location.ref ?? data.location.default(), model: { providerID: selectedModel.providerID, id: selectedModel.modelID, variant } })
      sessionID = created.id
    }

    let inputText = store.prompt.text
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    const sortedExtmarks = allExtmarks.sort((left: { start: number }, right: { start: number }) => right.start - left.start)
    for (const extmark of sortedExtmarks) {
      const ref = store.extmarkToPartIndex.get(extmark.id)
      if (ref?.type !== "pasted") continue
      const part = store.prompt.pasted[ref.index]
      if (!part) continue
      inputText = inputText.slice(0, extmark.start) + part.text + inputText.slice(extmark.end)
    }
    const currentMode = store.mode
    const editorSelection = editorContext()
    const pendingEditorSelection = editorSelection && editor.labelState() === "pending"
    if (store.mode === "shell") {
      void client.api.session.shell({ sessionID, command: inputText })
      setStore("mode", "normal")
    } else if (
      inputText.startsWith("/") &&
      (data.location.command.list(location.ref) ?? []).some((item) => item.name === inputText.split("\n")[0].split(" ")[0].slice(1))
    ) {
      // Parse command from first line, preserve multi-line content in arguments
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [command, ...firstLineArgs] = firstLine.split(" ")
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")

      void client.api.session.command({
        sessionID,
        name: command.slice(1),
        text: args,
        files: store.prompt.files,
        agents: store.prompt.agents,
        skills: store.prompt.skills,
      })
    } else {
      data.session.prompt({
          sessionID,
          text: inputText,
          files: store.prompt.files,
          agents: store.prompt.agents,
          skills: store.prompt.skills,
        })
        .catch(() => {})
      if (pendingEditorSelection) editor.markSelectionSent()
    }
    history.append({ ...store.prompt, mode: currentMode })
    input.extmarks.clear()
    setStore("prompt", { text: "", files: [], agents: [], skills: [], pasted: [] })
    setStore("extmarkToPartIndex", new Map())
    props.onSubmit?.()

    // temporary hack to make sure the message is sent
    if (!props.sessionID) {
      if (pendingEditorSelection) editor.preserveSelectionFromNewSession()
      route.navigate({ type: "session", sessionID })
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
      styleId: pasteStyleId(),
      typeId: promptPartTypeId,
    })

    setStore(produce((draft) => {
      const index = draft.prompt.pasted.length
      draft.prompt.pasted.push({ text, source: { start: extmarkStart, end: extmarkEnd, text: virtualText } })
      draft.extmarkToPartIndex.set(extmarkId, { type: "pasted", index })
    }))
  }

  async function pasteInputText(text: string) {
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const pastedContent = normalizedText.trim()
    const filepath = (() => {
      const raw = pastedContent.replace(/^['"]+|['"]+$/g, "")
      if (raw.startsWith("file://")) {
        try {
          return decodeURIComponent(new URL(raw).pathname)
        } catch {
          return raw
        }
      }
      if (process.platform === "win32") return raw
      return raw.replace(/\\(.)/g, "$1")
    })()
    const isUrl = /^(https?):\/\//.test(filepath)
    if (!isUrl) {
      try {
        const mime = await Bun.file(filepath).type || "application/octet-stream"
        const filename = path.basename(filepath)
        if (mime === "image/svg+xml") {
          const content = await Bun.file(filepath).text().catch(() => {})
          if (content) {
            pasteText(content, `[SVG: ${filename ?? "image"}]`)
            return
          }
        }
        if (mime.startsWith("image/") || mime === "application/pdf") {
          const content = await Bun.file(filepath).arrayBuffer()
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
      config.prompt?.paste !== "full"
    ) {
      pasteText(pastedContent, `[Pasted ~${lineCount} lines]`)
      return
    }

    input.insertText(normalizedText)

    setTimeout(() => {
      if (!input || input.isDestroyed) return
      renderer.requestRender()
    }, 0)
  }

  async function pasteAttachment(file: { filename?: string; filepath?: string; content: string; mime: string }) {
    const currentOffset = input.visualCursor.offset
    const extmarkStart = currentOffset
    const pdf = file.mime === "application/pdf"
    const count = (store.prompt.files ?? []).filter((file) => file.uri.startsWith("data:")).length
    const virtualText = pdf ? `[PDF ${count + 1}]` : `[Image ${count + 1}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId(),
      typeId: promptPartTypeId,
    })

    const part: NonNullable<PromptInfo["files"]>[number] = {
      uri: `data:${file.mime};base64,${file.content}`,
      description: file.filepath,
      name: file.filename,
      mention: { start: extmarkStart, end: extmarkEnd, text: virtualText },
    }
    setStore(produce((draft) => {
      const files = (draft.prompt.files ??= [])
      const index = files.length
      files.push(part)
      draft.extmarkToPartIndex.set(extmarkId, { type: "file", index })
    }))
    return
  }

  function clearPrompt() {
    if (store.prompt.text.trim().length >= DRAFT_RETENTION_MIN_CHARS || (store.prompt.files?.length ?? 0) > 0 || (store.prompt.agents?.length ?? 0) > 0 || store.prompt.pasted.length > 0) {
      history.append({
        ...store.prompt,
        mode: store.mode,
      })
    }
    input.clear()
    input.extmarks.clear()
    setStore("prompt", { text: "", files: [], agents: [], skills: [], pasted: [] })
    setStore("extmarkToPartIndex", new Map())
  }

  const highlight = createMemo(() => {
    if (isLeaderActive()) return theme.text.feedback.warning.base
    if (store.mode === "shell") return theme.text.action.primary.selected
    const agent = local.agent.current()
    if (!agent) return theme.border.base
    return local.agent.color(agent.id)
  })

  const showVariant = createMemo(() => !!local.model.variant.current())

  const agentMetaAlpha = createFadeIn(() => !!local.agent.current(), animationsEnabled)
  const modelMetaAlpha = createFadeIn(() => !!local.agent.current() && store.mode === "normal", animationsEnabled)
  const variantMetaAlpha = createFadeIn(
    () => !!local.agent.current() && store.mode === "normal" && showVariant(),
    animationsEnabled,
  )
  const borderHighlight = createMemo(() => tint(theme.border.base, highlight(), agentMetaAlpha()))

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

  const activityColor = createMemo(() => {
    const agent = local.agent.current()
    return agent ? local.agent.color(agent.id) : theme.border.base
  })
  const activityDot = createMemo(() => {
    if (!(config.animations ?? true)) return "●"
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
                  <text fg={theme.text.muted}>
                    {vimMode.isNormal() ? "NORMAL" : "INSERT"}
                  </text>
                  <Show when={local.agent.current()} fallback={<box height={1} />}>
                    {(agent) => (
                      <>
                        <Show when={props.compact}>
                          <text fg={fadeColor(theme.text.muted, agentMetaAlpha())}>·</text>
                        </Show>
                        <text fg={fadeColor(highlight(), agentMetaAlpha())}>
                          {store.mode === "shell" ? "Shell" : Locale.titlecase(agent().name)}
                        </text>
                        <Show when={store.mode === "normal"}>
                          <box flexDirection="row" gap={1}>
                            <text fg={fadeColor(theme.text.muted, modelMetaAlpha())}>·</text>
                            <text
                              flexShrink={0}
                              fg={fadeColor(theme.text.base, modelMetaAlpha())}
                            >
                              {location.current?.directory ?? paths.cwd}
                            </text>
                            <Show when={isLeaderActive()}>
                              <text fg={fadeColor(theme.text.muted, modelMetaAlpha())}>·</text>
                              <text fg={theme.text.feedback.warning.base}>
                                <span style={{ bold: true }}>⚡ LEADER</span>
                              </text>
                            </Show>
                            <Show when={showVariant()}>
                              <text fg={fadeColor(theme.text.muted, variantMetaAlpha())}>·</text>
                              <text>
                                <span style={{ fg: fadeColor(theme.text.feedback.warning.base, variantMetaAlpha()), bold: true }}>
                                  {local.model.variant.current()}
                                </span>
                              </text>
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
                flexDirection="row"
                backgroundColor={"#111111"}
                border={["top", "bottom", "left", "right"]}
                borderColor={RGBA.fromInts(255, 255, 255, 255)}
                paddingTop={1}
                paddingRight={2}
                paddingBottom={1}
                paddingLeft={2}
              >
                <box flexDirection="column" width={leaderMenuWidth()}>
                  <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
                    <text fg={RGBA.fromInts(255, 255, 255, 255)} attributes={TextAttributes.BOLD}>
                      {leaderMenuTitle()}
                    </text>
                    <text fg={theme.text.muted}>{leaderMenuSubtitle()}</text>
                  </box>
                  <For each={leaderMenuDynamicItems()}>
                    {(item) => (
                      isSeparator(item) ? (
                        <box marginY={0} paddingTop={0} paddingBottom={0}>
                          <text fg={theme.text.muted} wrapMode="none">{"─".repeat(leaderMenuWidth() - 4)}</text>
                        </box>
                      ) : (
                        <box 
                          flexDirection="row" 
                          gap={1} 
                          width="100%"
                          backgroundColor={item.key === selectedItem()?.key ? RGBA.fromInts(40, 40, 40, 255) : undefined}
                        >
                          <text fg={theme.text.feedback.warning.base} attributes={TextAttributes.BOLD}>
                            {item.key}
                          </text>
                          <text fg={theme.text.muted}>→</text>
                          {"icon" in item && item.icon ? (
                            <text fg={theme.hue.accent[500]}>{item.icon}</text>
                          ) : null}
                          <text
                            fg={"items" in item ? theme.hue.accent[500] : theme.text.base}
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
                    <text fg={theme.text.muted}>
                      {leaderActiveGroup() ? "backspace back" : "esc close"}
                    </text>
                    <text fg={theme.text.muted}>
                      {leaderActiveGroup() ? "esc close" : "space leader"}
                    </text>
                  </box>
                </box>
              </box>
            </Show>
            <box visible={!vimMode.isNormal() || isLeaderActive() || !vimHidePrompt()} flexDirection="row" alignItems="flex-start" backgroundColor={"#2a2a2a"} width="100%">
              <textarea
                placeholder={props.compact ? undefined : placeholderText()}
                placeholderColor={theme.text.muted}
                textColor={theme.text.base}
                focusedTextColor={theme.text.base}
                flexGrow={1}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                const value = input.plainText
                setStore("prompt", "text", value)
                auto()?.onInput(value)
                syncExtmarksWithPromptParts()
                setCursorVersion((value) => value + 1)
              }}
              onCursorChange={() => setCursorVersion((value) => value + 1)}
              onKeyDown={(e: KeyEvent) => {
                if ((e.name === "escape" || (e.ctrl && e.name === "[")) && !vimMode.isNormal()) {
                  enterVimNormalFromEscape(e)
                  return
                }
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
                  keymap.dispatch("prompt.paste")
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
                  getClipboardText: (text: string) => expandPastedTextPlaceholders(text, store.prompt.pasted),
                })
                setInputTarget(r)
                if (promptPartTypeId === 0) {
                  promptPartTypeId = input.extmarks.registerType("prompt-part")
                }
                props.ref?.(ref)
                promptRef.set(ref)
                setTimeout(() => {
                  // setTimeout is a workaround and needs to be addressed properly
                  if (!input || input.isDestroyed) return
                  input.cursorColor = theme.text.base
                }, 0)
              }}
              onMouseDown={(r: MouseEvent) => {
                if (vimMode.isNormal()) {
                  r.preventDefault()
                  return
                }
                r.target?.focus()
              }}
              cursorColor={props.disabled ? theme.background.raised.base : theme.text.base}
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
              vertical: theme.background.raised.base.a !== 0 ? "╹" : " ",
            }}
          >
            <box
              height={1}
              border={["bottom"]}
              borderColor={theme.background.raised.base}
              customBorderChars={
                theme.background.raised.base.a !== 0
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
            <box width="100%" flexDirection="row" justifyContent="space-between">
              <Show when={running()} fallback={<>{props.hint ?? <text />}</>}>
                <text fg={activityColor()}>{activityDot()} Thinking</text>
                <text fg={store.interrupt > 0 ? theme.text.action.primary.base : theme.text.base}>
                  esc <span style={{ fg: theme.text.muted }}>{store.interrupt > 0 ? "again to interrupt" : "interrupt"}</span>
                </text>
              </Show>
              <Show when={editorContextLabelState() !== "none" ? editorFileLabelDisplay() : undefined}>
                {(file) => <text fg={editorContextLabelState() === "pending" ? theme.text.action.secondary.base : theme.text.muted}>{file()}</text>}
              </Show>
              <Switch>
                <Match when={store.mode === "normal"}>
                  <Show when={isLeaderActive()}><text fg={theme.text.feedback.warning.base}>{leaderMenuHint()}</text></Show>
                  <Show when={!isLeaderActive() && !props.compact}><text>{agentShortcut()} agents</text></Show>
                  <Show when={!isLeaderActive() && !props.compact}><text>{paletteShortcut()} commands</text></Show>
                </Match>
                <Match when={store.mode === "shell"}><text>esc exit shell mode</text></Match>
              </Switch>
            </box>
          </box>
        </Show>
      </box>
    </>
  )
}
