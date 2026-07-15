import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
} from "solid-js"
import path from "node:path"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useDirectory } from "@tui/context/directory"
import { useRoute, useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useTuiPaths } from "@tui/context/runtime"
import { MinimalRendererBackground, useForkTheme } from "@/util/theme"
import { useProject } from "@tui/context/project"
import { useDialog } from "@tui/ui/dialog"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { useTuiConfig } from "@tui/config"
import { useKV } from "@tui/context/kv"
import { useSDK } from "@tui/context/sdk"
import { useEditorContext } from "@tui/context/editor"
import { useToast } from "@tui/ui/toast"
import { usePromptRef } from "@tui/context/prompt"
import { useThinkingMode, nextThinkingMode } from "@tui/context/thinking"
import { useLocal } from "@tui/context/local"
import { useEvent } from "@tui/context/event"
import { useClipboard } from "@tui/context/clipboard"
import { DialogTimeline } from "@tui/routes/session/dialog-timeline"
import { DialogForkFromTimeline } from "@tui/routes/session/dialog-fork-from-timeline"
import { DialogSessionRename } from "@tui/component/dialog-session-rename"
import { DialogRetryAction } from "@tui/component/dialog-retry-action"
import { DialogExportOptions } from "@tui/ui/dialog-export-options"
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"

import { Locale } from "@/util/locale"
import {
  getFirstChildSessionID,
  getParentSessionID,
  getSiblingChildSessionID,
} from "@/session-navigation"
import * as Model from "@tui/util/model"
import type { MinimalPromptRef, PromptRef } from "@/component/prompt"
import { Toast } from "@tui/ui/toast"
import {
  DialogMessage,
  PermissionPrompt,
  QuestionPrompt,
  SessionContext,
  sessionBindingCommands,
  SubagentFooter,
  useSession,
} from "@/upstream/session"
import { errorMessage } from "@/util/error"
import { useEpilogue } from "@tui/context/epilogue"
import { sessionEpilogue } from "@tui/util/presentation"
import { getRevertDiffFiles } from "@tui/util/revert-diff"
import { formatTranscript } from "@tui/util/transcript"
import { openEditor } from "@tui/editor"
import { AutocompleteHostProvider } from "@/context/autocomplete-host"
import { MinimalSessionPromptFooter, MinimalStatusBar } from "@/component/minimal-layout"
import { Sidebar } from "@/component/sidebar"
import { ForkModelCommand } from "@/component/dialog-model"
import { ModelFreeGuard } from "@/component/model-free-guard"

import { useBindings, useCommandShortcut } from "@tui/keymap"
import { reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { SimpleTool } from "@/component/simple-tool"
import { loadVimConfig, saveVimConfig } from "@/config/vim"
import type {
  AssistantMessage,
  Part,
  ReasoningPart,
  SessionStatus,
  TextPart,
  ToolPart,
  UserMessage as UserMessageType,
} from "@opencode-ai/sdk/v2"
import type { PromptInfo } from "@tui/prompt/history"
import { createCopyMode } from "@/feature/copy-mode"
import { useVimMode, useVimSession } from "@/feature/vim-mode"
import { getLeaderMenu } from "@/feature/leader-menu"

// ANSI color code to RGBA mapping
const ANSI_COLORS: Record<number, RGBA> = {
  // Standard colors (30-37 foreground, 40-47 background)
  30: RGBA.fromInts(0, 0, 0, 255),       // Black
  31: RGBA.fromInts(205, 49, 49, 255),   // Red
  32: RGBA.fromInts(13, 188, 121, 255),  // Green
  33: RGBA.fromInts(229, 229, 16, 255),  // Yellow
  34: RGBA.fromInts(36, 114, 200, 255),  // Blue
  35: RGBA.fromInts(188, 63, 188, 255),  // Magenta
  36: RGBA.fromInts(17, 168, 205, 255),  // Cyan
  37: RGBA.fromInts(229, 229, 229, 255), // White
  // Bright colors (90-97 foreground, 100-107 background)
  90: RGBA.fromInts(85, 85, 85, 255),    // Bright Black (Gray)
  91: RGBA.fromInts(255, 85, 85, 255),   // Bright Red
  92: RGBA.fromInts(85, 255, 85, 255),   // Bright Green
  93: RGBA.fromInts(255, 255, 85, 255),  // Bright Yellow
  94: RGBA.fromInts(85, 85, 255, 255),   // Bright Blue
  95: RGBA.fromInts(255, 85, 255, 255),  // Bright Magenta
  96: RGBA.fromInts(85, 255, 255, 255),  // Bright Cyan
  97: RGBA.fromInts(255, 255, 255, 255), // Bright White
}

interface AnsiSegment {
  text: string
  fg?: RGBA
  bg?: RGBA
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const GO_UPSELL_FREE_TIER_LAST_SEEN_AT = "go_upsell_last_seen_at"
const GO_UPSELL_FREE_TIER_DONT_SHOW = "go_upsell_dont_show"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT = "go_upsell_account_rate_limit_last_seen_at"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW = "go_upsell_account_rate_limit_dont_show"
const GO_UPSELL_WINDOW = 86_400_000
const GO_UPSELL_PROVIDERS = new Set(["opencode", "opencode-go"])

type RetryAction = Extract<SessionStatus, { type: "retry" }>["action"]

function goUpsellKeys(action: RetryAction) {
  if (!action) return
  if (!GO_UPSELL_PROVIDERS.has(action.provider)) return
  if (action.reason === "free_tier_limit") {
    return {
      lastSeenAt: GO_UPSELL_FREE_TIER_LAST_SEEN_AT,
      dontShow: GO_UPSELL_FREE_TIER_DONT_SHOW,
    }
  }
  if (action.reason === "account_rate_limit") {
    return {
      lastSeenAt: GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT,
      dontShow: GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW,
    }
  }
}

function parseAnsiText(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const ansiRegex = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let currentStyle: Partial<AnsiSegment> = {}
  
  let match: RegExpExecArray | null
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before this ANSI code
    if (match.index > lastIndex) {
      segments.push({
        ...currentStyle,
        text: text.slice(lastIndex, match.index),
      })
    }
    
    // Parse ANSI codes
    const codes = match[1].split(';').map(Number).filter(n => !isNaN(n))
    
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]
      
      if (code === 0) {
        // Reset
        currentStyle = {}
      } else if (code === 1) {
        currentStyle.bold = true
      } else if (code === 2) {
        currentStyle.dim = true
      } else if (code === 3) {
        currentStyle.italic = true
      } else if (code === 4) {
        currentStyle.underline = true
      } else if (code >= 30 && code <= 37) {
        currentStyle.fg = ANSI_COLORS[code]
      } else if (code >= 40 && code <= 47) {
        currentStyle.bg = ANSI_COLORS[code - 10] // Map bg to fg colors
      } else if (code >= 90 && code <= 97) {
        currentStyle.fg = ANSI_COLORS[code]
      } else if (code >= 100 && code <= 107) {
        currentStyle.bg = ANSI_COLORS[code - 10]
      } else if (code === 38 && codes[i + 1] === 5) {
        // 256 colors foreground
        const color256 = codes[i + 2]
        if (color256 !== undefined) {
          currentStyle.fg = rgbFrom256(color256)
          i += 2
        }
      } else if (code === 48 && codes[i + 1] === 5) {
        // 256 colors background
        const color256 = codes[i + 2]
        if (color256 !== undefined) {
          currentStyle.bg = rgbFrom256(color256)
          i += 2
        }
      }
    }
    
    lastIndex = ansiRegex.lastIndex
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      ...currentStyle,
      text: text.slice(lastIndex),
    })
  }
  
  return segments.length > 0 ? segments : [{ text }]
}

function rgbFrom256(index: number): RGBA {
  // Standard 16 colors
  if (index < 16) {
    return ANSI_COLORS[index] || RGBA.fromInts(128, 128, 128, 255)
  }
  // 216 colors (16-231)
  if (index < 232) {
    const i = index - 16
    const r = Math.floor(i / 36) * 51
    const g = Math.floor((i % 36) / 6) * 51
    const b = (i % 6) * 51
    return RGBA.fromInts(r, g, b, 255)
  }
  // Grayscale (232-255)
  const gray = (index - 232) * 10 + 8
  return RGBA.fromInts(gray, gray, gray, 255)
}

function hasAnsiCodes(text: string): boolean {
  return /\x1b\[/.test(text)
}

function AnsiText(props: { text: string; baseFg?: RGBA }) {
  const segments = createMemo(() => parseAnsiText(props.text))
  
  return (
    <For each={segments()}>
      {(segment) => (
        <text
          fg={segment.fg || props.baseFg}
          bg={segment.bg}
          attributes={
            (segment.bold ? TextAttributes.BOLD : 0) |
            (segment.dim ? TextAttributes.DIM : 0)
          }
        >
          {segment.text}
        </text>
      )}
    </For>
  )
}

function CompactUserMessage(props: {
  message: UserMessageType
  parts: Part[]
  index: number
  pending?: string
  onMouseUp?: () => void
}) {
  const ctx = useSession()
  const local = useLocal()
  const { theme } = useForkTheme()
  const text = createMemo(() => {
    const texts = props.parts
      .map((x) => {
        if (x.type === "text" && !x.synthetic) return x.text
        return null
      })
      .filter(Boolean)
      .join("\n")
    return texts.trim()
  })
  const files = createMemo(() => props.parts.flatMap((part) => (part.type === "file" ? [part] : [])))
  const compaction = createMemo(() => props.parts.find((part) => part.type === "compaction"))
  const queued = createMemo(() => props.pending && props.message.id > props.pending)
  const color = createMemo(() => local.agent.color(props.message.agent))
  return (
    <>
      <Show when={text() || files().length}>
        <box
          id={props.message.id}
          marginTop={props.index === 0 ? 0 : 1}
          onMouseUp={props.onMouseUp}
        >
          <Show when={text()}>
            <text fg={color()}>{text()}</text>
          </Show>
          <Show when={files().length}>
            <box flexDirection="row" marginTop={1} gap={1} flexWrap="wrap">
              <For each={files()}>
                {(file) => {
                  const directory = file.mime === "application/x-directory"
                  return (
                    <text fg={theme.textMuted}>{directory ? "Directory" : "File"} {file.filename}</text>
                  )
                }}
              </For>
            </box>
          </Show>
          <Show
            when={queued()}
            fallback={
              <Show when={ctx.showTimestamps()}>
                <text fg={theme.textMuted}>
                  <span style={{ fg: theme.textMuted }}>
                    {Locale.todayTimeOrDateTime(props.message.time.created)}
                  </span>
                </text>
              </Show>
            }
          >
            <text fg={theme.textMuted}>
              <span style={{ fg: color(), bold: true }}>QUEUED</span>
            </text>
          </Show>
        </box>
      </Show>
      <Show when={compaction()}>
        <box marginTop={1}>
          <text fg={theme.textMuted}>--- Compaction ---</text>
        </box>
      </Show>
    </>
  )
}



function CompactTextPart(props: { part: Part & { type: "text" } }) {
  const ctx = useSession()
  const { theme, syntax } = useForkTheme()
  const content = createMemo(() => props.part.text?.trim() ?? "")
  return (
    <Show when={content()}>
      <box id={`text-${props.part.id}`} paddingLeft={3} marginTop={1} flexShrink={0}>
        <markdown
          syntaxStyle={syntax()}
          streaming={true}
          internalBlockMode="top-level"
          content={content()}
          tableOptions={{ style: "grid" }}
          conceal={ctx.conceal()}
          fg={theme.markdownText}
          bg={theme.background}
        />
      </box>
    </Show>
  )
}

function CompactReasoningPart(props: { part: Part & { type: "reasoning" } }) {
  const ctx = useSession()
  const { theme, syntax } = useForkTheme()
  const content = createMemo(() => props.part.text.replace("[REDACTED]", "").trim())
  const showThinking = createMemo(() => ctx.thinkingMode() === "show")
  return (
    <Show when={content() && showThinking()}>
      <box id={`text-${props.part.id}`} paddingLeft={3} marginTop={1} flexShrink={0}>
        <markdown
          syntaxStyle={syntax()}
          streaming={true}
          internalBlockMode="top-level"
          content={content()}
          tableOptions={{ style: "grid" }}
          conceal={ctx.conceal()}
          fg={theme.markdownText}
          bg={theme.background}
        />
      </box>
    </Show>
  )
}

function CompactAssistantMessage(props: {
  message: AssistantMessage
  parts: Part[]
  last: boolean
  pureMode?: boolean
  hideTools?: boolean
}) {
  const ctx = useSession()
  const local = useLocal()
  const { theme } = useForkTheme()
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[props.message.sessionID] ?? [])

  const isWriteTool = (toolName: string) =>
    ["write", "editor_write", "edit", "apply_patch", "todowrite"].includes(toolName)

  const final = createMemo(() => {
    return props.message.finish && !["tool-calls", "unknown"].includes(props.message.finish)
  })

  const duration = createMemo(() => {
    if (!final()) return 0
    if (!props.message.time.completed) return 0
    const user = messages().find((x) => x.role === "user" && x.id === props.message.parentID)
    if (!user || !user.time) return 0
    return props.message.time.completed - user.time.created
  })

  const model = createMemo(() =>
    Model.name(ctx.providers(), props.message.providerID, props.message.modelID),
  )
  const status = createMemo(() => sync.data.session_status?.[props.message.sessionID] ?? { type: "idle" as const })
  const childShortcut = useCommandShortcut("session.child.first")
  const backgroundShortcut = useCommandShortcut("session.background")
  const [activityFrame, setActivityFrame] = createSignal(0)
  createEffect(() => {
    if (!props.last || status().type === "idle") {
      setActivityFrame(0)
      return
    }
    const timer = setInterval(() => setActivityFrame((i) => (i + 1) % 2), 500)
    onCleanup(() => clearInterval(timer))
  })
  const usage = createMemo(() => {
    const session = sync.session.get(props.message.sessionID)
    const last = messages().findLast(
      (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
    )
    if (!last) return

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return

    const modelInfo = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const pct = modelInfo?.limit.context ? `${Math.round((tokens / modelInfo.limit.context) * 100)}%` : undefined
    const cost = session?.cost ?? 0
    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: cost > 0 ? money.format(cost) : undefined,
    }
  })

  return (
    <box>
      <For each={props.parts}>
        {(part, index) => (
          <Switch>
            <Match when={part.type === "text"}>
              <CompactTextPart part={part as TextPart} />
            </Match>
            <Match when={part.type === "reasoning"}>
              <CompactReasoningPart part={part as ReasoningPart} />
            </Match>
            <Match when={part.type === "tool" && (!props.hideTools || isWriteTool((part as ToolPart).tool))}>
              <box id={`tool-${(part as ToolPart).id}`}>
                <SimpleTool part={part as ToolPart} />
              </box>
            </Match>
          </Switch>
        )}
      </For>
      <Show when={props.parts.some((part) => part.type === "tool" && part.tool === "task")}>
        <box marginTop={1}>
          <text fg={theme.text}>
            {childShortcut()}
            <span style={{ fg: theme.textMuted }}> view subagents</span>
            <Show
              when={
                sync.data.capabilities.experimentalBackgroundSubagents &&
                props.parts.some(
                  (part) =>
                    part.type === "tool" &&
                    part.tool === "task" &&
                    part.state.status === "running" &&
                    part.state.metadata?.background !== true,
                )
              }
            >
              <span style={{ fg: theme.textMuted }}> · </span>
              {backgroundShortcut()}
              <span style={{ fg: theme.textMuted }}> background</span>
            </Show>
          </text>
        </box>
      </Show>
      <Show
        when={
          props.message.error && props.message.error.name !== "MessageAbortedError"
        }
      >
        <text fg={theme.error}>{errorMessage(props.message.error)}</text>
      </Show>
      <Show
        when={
          props.last ||
          final() ||
          props.message.error?.name === "MessageAbortedError"
        }
      >
        <text fg={props.message.error?.name === "MessageAbortedError" ? theme.error : theme.textMuted}>
          <Show when={!props.pureMode}>
            <span style={{ fg: props.message.error?.name === "MessageAbortedError" ? theme.error : local.agent.color(props.message.agent) }}>
              {props.message.error?.name === "MessageAbortedError" ? "⏸ " : "✔ "}
            </span>
            {Locale.titlecase(props.message.mode)} · {model()}
          </Show>
          <Show when={props.last && status().type !== "idle"}>
            <Show when={!props.pureMode}>{" "}· </Show>
            <span style={{ fg: local.agent.color(props.message.agent) }}>{activityFrame() === 0 ? "●" : "○"}</span>{" "}Thinking
            <Show when={!props.pureMode && usage()}>
              {(item) => <> · {[item().context, item().cost].filter(Boolean).join(" · ")}</>}
            </Show>
          </Show>
          <Show when={duration() && !props.pureMode}> · {Locale.duration(duration())}</Show>
          <Show when={props.message.error?.name === "MessageAbortedError"}>
            {" "}· interrupted
          </Show>
        </text>
      </Show>
    </box>
  )
}

function RevertPanel(props: {
  count: number
  files: {
    filename: string
    additions: number
    deletions: number
  }[]
  onRedo: () => void
}) {
  const { theme } = useForkTheme()
  const redoShortcut = useCommandShortcut("session.redo")
  return (
    <box marginTop={1}>
      <text fg={theme.textMuted}>{props.count} message reverted</text>
      <text fg={theme.textMuted} onMouseUp={props.onRedo}>
        <span style={{ fg: theme.text }}>{redoShortcut()}</span> or /redo to restore
      </text>
      <Show when={props.files.length}>
        <box marginTop={1}>
          <For each={props.files}>
            {(file) => (
              <text fg={theme.text}>
                {file.filename}
                <Show when={file.additions > 0}>
                  <span style={{ fg: theme.diffAdded }}> +{file.additions}</span>
                </Show>
                <Show when={file.deletions > 0}>
                  <span style={{ fg: theme.diffRemoved }}> -{file.deletions}</span>
                </Show>
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}

export function MinimalSession() {
  const route = useRouteData("session")
  const { navigate } = useRoute()
  const sync = useSync()
  const event = useEvent()
  const project = useProject()
  const tuiConfig = useTuiConfig()
  const paths = useTuiPaths()
  const kv = useKV()
  const { theme } = useForkTheme()
  const promptRef = usePromptRef()
  const dialog = useDialog()
  const renderer = useRenderer()
  const sdk = useSDK()
  const clipboard = useClipboard()
  const editor = useEditorContext()
  const toast = useToast()
  const local = useLocal()
  const dimensions = useTerminalDimensions()
  const setEpilogue = useEpilogue()
  const directory = useDirectory()
  const leaderMenu = createMemo(() => getLeaderMenu(directory()))
  const pureMode = createMemo(() => kv.get("minimal_pure_mode") ?? false)
  const hideTools = createMemo(() => kv.get("minimal_hide_tools") ?? false)
  const vimConfig = createMemo(() => loadVimConfig(directory()))
  const autoAllowPermissions = createMemo(() => kv.get("minimal_permission_auto_allow") ?? vimConfig().autoAllowPermissions ?? false)

  event.on("session.status", (evt) => {
    if (evt.properties.sessionID !== route.sessionID) return
    if (evt.properties.status.type !== "retry") return
    if (!evt.properties.status.action) return
    if (dialog.stack.length > 0) return

    const keys = goUpsellKeys(evt.properties.status.action)
    if (!keys) return

    const seen = kv.get(keys.lastSeenAt)
    if (typeof seen === "number" && Date.now() - seen < GO_UPSELL_WINDOW) return
    if (kv.get(keys.dontShow)) return

    void DialogRetryAction.show(dialog, evt.properties.status.action).then((dontShowAgain) => {
      if (dontShowAgain) kv.set(keys.dontShow, true)
      kv.set(keys.lastSeenAt, Date.now())
    })
  })

  const session = createMemo(() => sync.session.get(route.sessionID))
  const children = createMemo(() => {
    const parentID = session()?.parentID ?? session()?.id
    return sync.data.session
      .filter((x) => x.parentID === parentID || x.id === parentID)
      .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  })
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const foregroundTasks = createMemo(() =>
    sync.data.capabilities.experimentalBackgroundSubagents
      ? messages().flatMap((message) =>
          (sync.data.part[message.id] ?? []).filter(
            (part): part is ToolPart =>
              part.type === "tool" &&
              part.tool === "task" &&
              part.state.status === "running" &&
              part.state.metadata?.background !== true,
          ),
        )
      : [],
  )
  const permissions = createMemo(() => {
    if (session()?.parentID) return []
    return children().flatMap((x) => sync.data.permission[x.id] ?? [])
  })
  const questions = createMemo(() => {
    if (session()?.parentID) return []
    return children().flatMap((x) => sync.data.question[x.id] ?? [])
  })
  const visible = createMemo(
    () => !session()?.parentID && permissions().length === 0 && questions().length === 0,
  )
  const disabled = createMemo(() => permissions().length > 0 || questions().length > 0)

  const pending = createMemo(() => {
    return messages().findLast((x) => x.role === "assistant" && !x.time.completed)?.id
  })

  const lastAssistant = createMemo(() => {
    return messages().findLast((x) => x.role === "assistant")
  })
  const revertInfo = createMemo(() => session()?.revert)
  const revertMessageID = createMemo(() => revertInfo()?.messageID)
  const revertDiffFiles = createMemo(() => getRevertDiffFiles(revertInfo()?.diff ?? ""))
  const revertRevertedMessages = createMemo(() => {
    const messageID = revertMessageID()
    if (!messageID) return []
    return messages().filter((message) => message.id >= messageID && message.role === "user")
  })

  const contentWidth = createMemo(() => dimensions().width - 3)

  const thinking = useThinkingMode()
  const thinkingMode = thinking.mode
  const showThinking = createMemo(() => true)
  const [conceal, setConceal] = createSignal(true)
  const [timestamps, setTimestamps] = kv.signal<"hide" | "show">("timestamps", "hide")
  const showTimestamps = createMemo(() => timestamps() === "show")
  const [showDetails, setShowDetails] = kv.signal("tool_details_visibility", true)
  const [diffWrapMode] = kv.signal<"word" | "none">("diff_wrap_mode", "word")
  const [showGenericToolOutput, setShowGenericToolOutput] = kv.signal("generic_tool_output_visibility", false)
  const [showScrollbar, setShowScrollbar] = kv.signal("minimal_session_scrollbar", false)

  const providers = createMemo(() => Model.index(sync.data.provider))
  let scroll: ScrollBoxRenderable | undefined
  let prompt: MinimalPromptRef | undefined
  let seeded = false
  const vimMode = useVimMode()
  onMount(() => {
    vimMode.enterInsert()
  })
  const copyMode = createCopyMode({
    scroll: () => scroll,
    messages,
    parts: (id) => sync.data.part[id] ?? [],
    thinking: () => showThinking(),
    details: () => showDetails(),
  })

  useVimSession(
    () => scroll,
    () => prompt,
    copyMode,
    dialog,
    () => directory(),
    leaderMenu,
  )

  const commandMatcher = reactiveMatcherFromSignal(() => true)
  useBindings(() => ({
    enabled: commandMatcher,
    bindings: tuiConfig.keybinds.gather("session", sessionBindingCommands),
  }))

  useBindings(() => ({
    enabled: reactiveMatcherFromSignal(() => foregroundTasks().length > 0),
    priority: 1,
    bindings: tuiConfig.keybinds.get("session.background"),
  }))

  useBindings(() => ({
    enabled: commandMatcher,
    bindings: [
      {
        key: "ctrl+c",
        cmd: () => {
          if (!prompt) return true

          const hasDraft = prompt.current.input !== "" || prompt.current.parts.length > 0
          if (hasDraft) {
            prompt.reset()
            if (!vimMode.isNormal()) {
              setTimeout(() => prompt?.focus(), 0)
            }
            return true
          }

          const status = sync.data.session_status?.[route.sessionID]?.type
          if (status && status !== "idle") {
            prompt.interrupt()
            return true
          }

          if (vimMode.isNormal()) {
            return true
          }

          setTimeout(() => prompt?.focus(), 0)
          return true
        },
      },
    ],
  }))

  function moveFirstChild() {
    const next = getFirstChildSessionID(children())
    if (next) {
      navigate({
        type: "session",
        sessionID: next,
      })
    }
  }

  function moveChild(direction: 1 | -1) {
    const next = getSiblingChildSessionID(children(), session()?.id, direction)
    if (next) {
      navigate({
        type: "session",
        sessionID: next,
      })
    }
  }

  function scrollToMessage(messageID?: string) {
    if (!messageID || !scroll) return
    const child = scroll.getChildren().find((item: { id?: string }) => item.id === messageID)
    if (child) scroll.scrollBy(child.y - scroll.y - 1)
  }

  function copyShareURL(url: string) {
    void clipboard.write?.(url).then(
      () => toast.show({ message: "Share URL copied to clipboard!", variant: "success" }),
      () => toast.show({ message: "Failed to copy URL to clipboard", variant: "error" }),
    )
  }

  function findNextVisibleMessage(direction: "next" | "prev") {
    const currentScroll = scroll
    if (!currentScroll) return
    const children = currentScroll
      .getChildren()
      .filter((child: { id?: string; y: number }) => {
        if (!child.id) return false
        const message = messages().find((item) => item.id === child.id)
        if (!message) return false
        const parts = sync.data.part[message.id]
        return parts?.some((part) => part.type === "text" && !part.synthetic && !part.ignored)
      })
      .sort((a: { y: number }, b: { y: number }) => a.y - b.y)
    if (direction === "next") return children.find((child: { y: number }) => child.y > currentScroll.y + 10)?.id
    return children.toReversed().find((child: { y: number }) => child.y < currentScroll.y - 10)?.id
  }

  function scrollToMessageBoundary(direction: "next" | "prev") {
    const targetID = findNextVisibleMessage(direction)
    if (!targetID) {
      scroll?.scrollBy(direction === "next" ? scroll.height : -scroll.height)
      dialog.clear()
      return
    }
    scrollToMessage(targetID)
    dialog.clear()
  }

  function transcript() {
    const current = session()
    if (!current) return
    return formatTranscript(
      current,
      messages().map((message) => ({
        info: message as UserMessageType | AssistantMessage,
        parts: sync.data.part[message.id] ?? [],
      })),
      {
        thinking: showThinking(),
        toolDetails: showDetails(),
        assistantMetadata: false,
        providers: sync.data.provider,
      },
    )
  }

  useBindings(() => ({
    commands: [
      {
        name: "session.share",
        title: session()?.share?.url ? "Copy share link" : "Share session",
        category: "Session",
        enabled: sync.data.config.share !== "disabled",
        slashName: "share",
        run: async () => {
          const url = session()?.share?.url
          if (url) {
            copyShareURL(url)
            dialog.clear()
            return
          }
          if (!kv.get("share_consent", false)) {
            const ok = await DialogConfirm.show(dialog, "Share Session", "Are you sure you want to share it?")
            if (ok !== true) return
            kv.set("share_consent", true)
          }
          await sdk.client.session
            .share({
              sessionID: route.sessionID,
            })
            .then((res) => {
              const shareURL = res.data?.share?.url
              if (shareURL) copyShareURL(shareURL)
            })
            .catch((error) => {
              toast.show({
                message: errorMessage(error),
                variant: "error",
              })
            })
          dialog.clear()
        },
      },
      {
        name: "session.unshare",
        title: "Unshare session",
        category: "Session",
        enabled: !!session()?.share?.url,
        slashName: "unshare",
        run: async () => {
          await sdk.client.session
            .unshare({
              sessionID: route.sessionID,
            })
            .then(() => toast.show({ message: "Session unshared successfully", variant: "success" }))
            .catch((error) => {
              toast.show({
                message: errorMessage(error),
                variant: "error",
              })
            })
          dialog.clear()
        },
      },
      {
        name: "session.rename",
        title: "Rename session",
        category: "Session",
        slashName: "rename",
        run: () => {
          dialog.replace(() => <DialogSessionRename session={route.sessionID} />)
        },
      },
      {
        name: "session.timeline",
        title: "Jump to message",
        category: "Session",
        slashName: "timeline",
        run: () => {
          dialog.replace(() => (
            <DialogTimeline
              onMove={scrollToMessage}
              sessionID={route.sessionID}
              setPrompt={(next) => prompt?.set(next)}
            />
          ))
        },
      },
      {
        name: "session.fork",
        title: "Fork session",
        category: "Session",
        slashName: "fork",
        run: () => {
          dialog.replace(() => <DialogForkFromTimeline onMove={scrollToMessage} sessionID={route.sessionID} />)
        },
      },
      {
        name: "session.compact",
        title: "Compact session",
        category: "Session",
        slashName: "compact",
        slashAliases: ["summarize"],
        run: () => {
          const selectedModel = local.model.current()
          if (!selectedModel) {
            toast.show({
              variant: "warning",
              message: "Connect a provider to summarize this session",
              duration: 3000,
            })
            return
          }
          void sdk.client.session.summarize({
            sessionID: route.sessionID,
            modelID: selectedModel.modelID,
            providerID: selectedModel.providerID,
          })
          dialog.clear()
        },
      },
      {
        name: "session.undo",
        title: "Undo previous message",
        category: "Session",
        slashName: "undo",
        run: async () => {
          const status = sync.data.session_status?.[route.sessionID]
          if (status?.type !== "idle") await sdk.client.session.abort({ sessionID: route.sessionID }).catch(() => {})
          const revert = session()?.revert?.messageID
          const message = messages().findLast((item) => (!revert || item.id < revert) && item.role === "user")
          if (!message) return
          void sdk.client.session
            .revert({
              sessionID: route.sessionID,
              messageID: message.id,
            })
            .then(() => {
              toBottom()
            })
          const parts = sync.data.part[message.id] ?? []
          prompt?.set(
            parts.reduce(
              (agg, part) => {
                if (part.type === "text" && !part.synthetic) agg.input += part.text
                if (part.type === "file") agg.parts.push(part)
                return agg
              },
              { input: "", parts: [] as PromptInfo["parts"] },
            ),
          )
          dialog.clear()
        },
      },
      {
        name: "session.redo",
        title: "Redo",
        category: "Session",
        enabled: !!session()?.revert?.messageID,
        slashName: "redo",
        run: () => {
          dialog.clear()
          const messageID = session()?.revert?.messageID
          if (!messageID) return
          const message = messages().find((item) => item.role === "user" && item.id > messageID)
          if (!message) {
            void sdk.client.session.unrevert({
              sessionID: route.sessionID,
            })
            prompt?.set({ input: "", parts: [] })
            return
          }
          void sdk.client.session.revert({
            sessionID: route.sessionID,
            messageID: message.id,
          })
        },
      },
      {
        name: "session.first",
        title: "First message",
        category: "Session",
        hidden: true,
        run: () => {
          scroll?.scrollTo(0)
          dialog.clear()
        },
      },
      {
        name: "session.last",
        title: "Last message",
        category: "Session",
        hidden: true,
        run: () => {
          scroll?.scrollTo(scroll.scrollHeight)
          dialog.clear()
        },
      },
      {
        name: "session.messages_last_user",
        title: "Jump to last user message",
        category: "Session",
        hidden: true,
        run: () => {
          const message = messages()
            .toReversed()
            .find(
              (item) =>
                item.role === "user" &&
                (sync.data.part[item.id] ?? []).some(
                  (part) => part.type === "text" && !part.synthetic && !part.ignored,
                ),
            )
          scrollToMessage(message?.id)
          dialog.clear()
        },
      },
      {
        name: "session.message.next",
        title: "Next message",
        category: "Session",
        hidden: true,
        run: () => scrollToMessageBoundary("next"),
      },
      {
        name: "session.message.previous",
        title: "Previous message",
        category: "Session",
        hidden: true,
        run: () => scrollToMessageBoundary("prev"),
      },
      {
        name: "messages.copy",
        title: "Copy last assistant message",
        category: "Session",
        run: () => {
          const revert = session()?.revert?.messageID
          const message = messages().findLast((item) => item.role === "assistant" && (!revert || item.id < revert))
          if (!message) {
            toast.show({ message: "No assistant messages found", variant: "error" })
            dialog.clear()
            return
          }
          const text = (sync.data.part[message.id] ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (!text) {
            toast.show({ message: "No text content found in last assistant message", variant: "error" })
            dialog.clear()
            return
          }
          void clipboard.write?.(text).then(
            () => toast.show({ message: "Message copied to clipboard!", variant: "success" }),
            () => toast.show({ message: "Failed to copy to clipboard", variant: "error" }),
          )
          dialog.clear()
        },
      },
      {
        name: "session.copy",
        title: "Copy session transcript",
        category: "Session",
        slashName: "copy",
        run: async () => {
          const content = transcript()
          if (!content) return
          await clipboard.write?.(content).then(
            () => toast.show({ message: "Session transcript copied to clipboard!", variant: "success" }),
            () => toast.show({ message: "Failed to copy session transcript", variant: "error" }),
          )
          dialog.clear()
        },
      },
      {
        name: "session.export",
        title: "Export session transcript",
        category: "Session",
        slashName: "export",
        run: async () => {
          const current = session()
          const content = transcript()
          if (!current || !content) return
          const options = await DialogExportOptions.show(
            dialog,
            `session-${current.id.slice(0, 8)}.md`,
            showThinking(),
            showDetails(),
            false,
            false,
          )
          if (options === null) return
          const exported = formatTranscript(
            current,
            messages().map((message) => ({
              info: message as UserMessageType | AssistantMessage,
              parts: sync.data.part[message.id] ?? [],
            })),
            {
              thinking: options.thinking,
              toolDetails: options.toolDetails,
              assistantMetadata: options.assistantMetadata,
              providers: sync.data.provider,
            },
          )
          const edited = await openEditor({
            renderer,
            value: exported,
            cwd: project.instance.directory() || paths.cwd,
          })
          if (options.openWithoutSaving) return
          await Bun.write(path.join(paths.cwd, options.filename.trim()), edited ?? exported)
          toast.show({ message: `Session exported to ${options.filename.trim()}`, variant: "success" })
          dialog.clear()
        },
      },
      {
        name: "session.child.first",
        title: "Go to child session",
        category: "Session",
        run: () => {
          moveFirstChild()
        },
      },
      {
        name: "session.parent",
        title: "Go to parent session",
        category: "Session",
        run: () => {
          const parentID = getParentSessionID(session())
          if (!parentID) return false
          navigate({
            type: "session",
            sessionID: parentID,
          })
        },
      },
      {
        name: "session.child.next",
        title: "Next child session",
        category: "Session",
        run: () => {
          if (!session()?.parentID) return false
          moveChild(1)
        },
      },
      {
        name: "session.child.previous",
        title: "Previous child session",
        category: "Session",
        run: () => {
          if (!session()?.parentID) return false
          moveChild(-1)
        },
      },
      {
        name: "session.background",
        title: "Background subagents",
        category: "Session",
        hidden: true,
        run: () => {
          if (foregroundTasks().length === 0) return false
          void sdk.client.experimental.session.background({
            sessionID: route.sessionID,
            workspace: project.workspace.current(),
          })
          dialog.clear()
        },
      },
      {
        name: "session.toggle.thinking",
        title: "Toggle thinking mode",
        category: "Session",
        run: () => {
          thinking.set(nextThinkingMode(thinkingMode()))
          dialog.clear()
        },
      },
      {
        name: "session.toggle.conceal",
        title: conceal() ? "Disable code concealment" : "Enable code concealment",
        category: "Session",
        run: () => {
          setConceal((prev) => !prev)
          dialog.clear()
        },
      },
      {
        name: "session.toggle.timestamps",
        title: showTimestamps() ? "Hide timestamps" : "Show timestamps",
        category: "Session",
        slashName: "timestamps",
        slashAliases: ["toggle-timestamps"],
        run: () => {
          setTimestamps((prev) => (prev === "show" ? "hide" : "show"))
          dialog.clear()
        },
      },
      {
        name: "session.toggle.actions",
        title: showDetails() ? "Hide tool details" : "Show tool details",
        category: "Session",
        run: () => {
          setShowDetails((prev) => !prev)
          dialog.clear()
        },
      },
      {
        name: "session.toggle.generic_tool_output",
        title: showGenericToolOutput() ? "Hide generic tool output" : "Show generic tool output",
        category: "Session",
        run: () => {
          setShowGenericToolOutput((prev) => !prev)
          dialog.clear()
        },
      },
      {
        name: "session.toggle.scrollbar",
        title: "Toggle session scrollbar",
        category: "Session",
        run: () => {
          setShowScrollbar((prev) => !prev)
          dialog.clear()
        },
      },
      {
        name: "minimal.toggle.enter_focus_prompt",
        title: kv.get("minimal_vim_enter_focus_prompt", true)
          ? "Disable Enter to focus prompt"
          : "Enable Enter to focus prompt",
        category: "Settings",
        run: () => {
          kv.set("minimal_vim_enter_focus_prompt", !kv.get("minimal_vim_enter_focus_prompt", true))
          dialog.clear()
        },
      },
      {
        name: "vim.toggle.hidePrompt",
        title: "Toggle vim hide prompt",
        category: "Vim",
        run: () => {
          const next = !kv.get("minimal_vim_hide_prompt", false)
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
          const next = !kv.get("minimal_vim_auto_resume", false)
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
      {
        name: "vim.toggle.hideTools",
        title: "Toggle hide tools",
        category: "Vim",
        run: () => {
          const next = !kv.get("minimal_hide_tools", false)
          kv.set("minimal_hide_tools", next)
          toast.show({
            message: `Hide tools: ${next ? "ON" : "OFF"}`,
            variant: "info",
            duration: 2000,
          })
          dialog.clear()
        },
      },
      {
        name: "session.sidebar.toggle",
        title: "Toggle sidebar",
        category: "Session",
        run: () => {
          const next = !kv.get("minimal_sidebar_visible", false)
          kv.set("minimal_sidebar_visible", next)
          toast.show({
            message: `Sidebar: ${next ? "ON" : "OFF"}`,
            variant: "info",
            duration: 2000,
          })
          dialog.clear()
        },
      },
      {
        name: "vim.toggle.autoAllowPermissions",
        title: "Toggle auto-allow permissions",
        category: "Vim",
        run: () => {
          const next = !autoAllowPermissions()
          kv.set("minimal_permission_auto_allow", next)
          saveVimConfig(directory(), { autoAllowPermissions: next })
          toast.show({
            message: `Auto-allow permissions: ${next ? "ON" : "OFF"}`,
            variant: "info",
            duration: 2000,
          })
          dialog.clear()
        },
      },
    ],
  }))

  // Auto-reply to pending permissions when auto-allow is enabled
  createEffect(() => {
    const active = kv.get("minimal_permission_auto_allow") === true
    if (!active) return
    for (const p of permissions()) {
      void sdk.client.permission.reply({
        reply: "always",
        requestID: p.id,
        directory: directory(),
        workspace: project.workspace.current(),
      })
    }
  })

  createEffect(() => {
    const title = Locale.truncate(session()?.title ?? "", 50)
    setEpilogue(sessionEpilogue({ title, sessionID: session()?.id }))
  })
  onCleanup(() => setEpilogue())

  createEffect(() => {
    const sessionID = route.sessionID
    void (async () => {
      const previousWorkspace = untrack(() => project.workspace.current())
      const result = await sdk.client.session.get(
        { sessionID },
        { throwOnError: true },
      )
      if (!result.data) {
        toast.show({
          message: `Session not found: ${sessionID}`,
          variant: "error",
          duration: 5000,
        })
        navigate({ type: "home" })
        return
      }

      if (result.data.workspaceID !== previousWorkspace) {
        project.workspace.set(result.data.workspaceID)
        try {
          await sync.bootstrap({ fatal: false })
        } catch {}
      }
      editor.reconnect(result.data.directory)
      await sync.session.sync(sessionID)
      if (route.sessionID === sessionID && scroll) scroll.scrollBy(100_000)
    })().catch((error) => {
      if (route.sessionID !== sessionID) return
      toast.show({
        message: errorMessage(error),
        variant: "error",
        duration: 5000,
      })
      navigate({ type: "home" })
    })
  })

  createEffect(on(() => route.sessionID, () => scroll?.scrollBy(100_000)))

  const bind = (r: PromptRef | undefined) => {
    prompt = r as MinimalPromptRef | undefined
    promptRef.set(r)
    if (seeded || !route.prompt || !r) return
    seeded = true
    r.set(route.prompt)
  }

  const toBottom = () => scroll?.scrollBy(100_000)

const sidebarVisible = createMemo(() => kv.get("minimal_sidebar_visible", false))

  const contextValue = {
    get width() {
      return contentWidth()
    },
    sessionID: route.sessionID,
    conceal,
    thinkingMode,
    showThinking,
    showTimestamps,
    showDetails,
    showGenericToolOutput,
    diffWrapMode,
    providers,
    sync,
    tui: tuiConfig,
  }

  return (
    <AutocompleteHostProvider>
      <ModelFreeGuard />
      <ForkModelCommand />
      <MinimalRendererBackground />
      <SessionContext.Provider value={contextValue}>
          <box flexDirection="column" flexGrow={1} minHeight={0} position="relative">
            <Show when={route.sessionID}>
              <MinimalStatusBar sessionID={route.sessionID} pureMode={pureMode()} />
              <box flexGrow={1} minHeight={0}>
                <box flexGrow={1} minHeight={0}>
                  <scrollbox
                    ref={(r) => (scroll = r)}
                    stickyScroll={true}
                    stickyStart="bottom"
                    flexGrow={1}
                    verticalScrollbarOptions={{ visible: showScrollbar() }}
                    horizontalScrollbarOptions={{ visible: false }}
                  >
                  <For each={messages()}>
                    {(message, index) => (
                      <box width="100%">
                        <Switch>
                          <Match when={message.id === revertMessageID()}>
                            <RevertPanel
                              count={revertRevertedMessages().length}
                              files={revertDiffFiles()}
                              onRedo={() => {
                                void DialogConfirm.show(
                                  dialog,
                                  "Confirm Redo",
                                  "Are you sure you want to restore the reverted messages?",
                                ).then((confirmed) => {
                                  if (confirmed) void sdk.client.session.unrevert({ sessionID: route.sessionID })
                                })
                              }}
                            />
                          </Match>
                          <Match when={revertMessageID() && message.id >= revertMessageID()!}>
                            <></>
                          </Match>
                          <Match when={message.role === "user"}>
                            <CompactUserMessage
                               message={message as UserMessageType}
                               parts={sync.data.part[message.id] ?? []}
                               index={index()}
                               pending={pending()}
                               onMouseUp={() => {
                                 dialog.replace(() => (
                                   <DialogMessage
                                     messageID={message.id}
                                     sessionID={route.sessionID}
                                     setPrompt={(next) => prompt?.set(next)}
                                   />
                                 ))
                               }}
                            />
                          </Match>
                          <Match when={message.role === "assistant"}>
                            <CompactAssistantMessage
                               last={lastAssistant()?.id === message.id}
                               message={message as AssistantMessage}
                               parts={sync.data.part[message.id] ?? []}
                               pureMode={pureMode()}
                               hideTools={hideTools()}
                            />
                          </Match>
                        </Switch>
                      </box>
                    )}
                  </For>
                  </scrollbox>
                </box>
              </box>
              <box flexShrink={0}>
                <Show when={permissions().length > 0}>
                  <box
                    border={["top", "bottom", "left", "right"]}
                    borderColor={RGBA.fromInts(255, 255, 255, 255)}
                  >
                    <PermissionPrompt
                      request={permissions()[0]}
                      directory={sync.session.get(permissions()[0].sessionID)?.directory}
                    />
                  </box>
                </Show>
                <Show
                  when={permissions().length === 0 && questions().length > 0}
                >
                  <QuestionPrompt
                    request={questions()[0]}
                    directory={sync.session.get(questions()[0].sessionID)?.directory}
                  />
                </Show>
                <Show when={session()?.parentID}>
                  <SubagentFooter />
                </Show>
                <Show when={visible()}>
                  <MinimalSessionPromptFooter
                    bind={bind}
                    sessionID={route.sessionID}
                    visible={visible()}
                    disabled={disabled()}
                    onSubmit={() => toBottom()}
                    menu={leaderMenu()}
                  />
                </Show>
              </box>
            </Show>
            <Show when={sidebarVisible()}>
              <box
                position="absolute"
                top={2}
                right={0}
                marginRight={1}
                width={42}
                flexDirection="column"
                backgroundColor={"#111111"}
                border={["top", "bottom", "left", "right"]}
                borderColor={RGBA.fromInts(255, 255, 255, 255)}
                paddingTop={1}
                paddingBottom={1}
                paddingLeft={1}
                paddingRight={1}
                zIndex={10}
              >
                <Sidebar sessionID={route.sessionID} compact bare hideFooter />
              </box>
            </Show>
            <Toast />
          </box>
      </SessionContext.Provider>
    </AutocompleteHostProvider>
  )
}
