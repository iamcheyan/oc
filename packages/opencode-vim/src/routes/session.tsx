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
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { useDirectory } from "@tui/context/directory"
import { useRoute, useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { MinimalRendererBackground, selectedForeground, useForkTheme } from "@/util/theme"
import { useProject } from "@tui/context/project"
import { useDialog } from "@tui/ui/dialog"
import { useTuiConfig } from "@tui/config"
import { useKV } from "@tui/context/kv"
import { useSDK } from "@tui/context/sdk"
import { useEditorContext } from "@tui/context/editor"
import { useToast } from "@tui/ui/toast"
import { usePromptRef } from "@tui/context/prompt"
import { useThinkingMode, nextThinkingMode } from "@tui/context/thinking"
import { useLocal } from "@tui/context/local"
import { useEvent } from "@tui/context/event"
import { RGBA, TextAttributes } from "@opentui/core"
import { PathFormatterProvider } from "@tui/context/path-format"
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
import { AutocompleteHostProvider } from "@/context/autocomplete-host"
import { MinimalSessionPromptFooter, MinimalStatusBar } from "@/component/minimal-layout"
import { Sidebar } from "@/component/sidebar"

import { useBindings } from "@tui/keymap"
import { reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { SimpleTool } from "@/component/simple-tool"
import type {
  AssistantMessage,
  Part,
  UserMessage as UserMessageType,
} from "@opencode-ai/sdk/v2"
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
}) {
  const local = useLocal()
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
  const color = createMemo(() => local.agent.color(props.message.agent))
  return (
    <Show when={text()}>
      <box id={props.message.id}>
        <text fg={color()}>{text()}</text>
      </box>
    </Show>
  )
}



function CompactTextPart(props: { part: Part & { type: "text" } }) {
  const { theme, syntax } = useForkTheme()
  const content = createMemo(() => props.part.text?.trim() ?? "")
  return (
    <Show when={content()}>
      <box id={`text-${props.part.id}`}>
        <markdown
          syntaxStyle={syntax()}
          streaming={true}
          content={content()}
          tableOptions={{ style: "grid" }}
          fg={theme.text}
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
      <box id={`text-${props.part.id}`}>
        <markdown
          syntaxStyle={syntax()}
          streaming={true}
          content={content()}
          tableOptions={{ style: "grid" }}
          fg={theme.text}
        />
      </box>
    </Show>
  )
}

function CompactAssistantMessage(props: {
  message: AssistantMessage
  parts: Part[]
  last: boolean
}) {
  const ctx = useSession()
  const local = useLocal()
  const { theme } = useForkTheme()
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[props.message.sessionID] ?? [])

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
              <CompactTextPart part={part as any} />
            </Match>
            <Match when={part.type === "reasoning"}>
              <CompactReasoningPart part={part as any} />
            </Match>
            <Match when={part.type === "tool"}>
              <box id={`tool-${(part as any).id}`}>
                <SimpleTool part={part as any} />
              </box>
            </Match>
          </Switch>
        )}
      </For>
      <Show
        when={
          props.message.error && props.message.error.name !== "MessageAbortedError"
        }
      >
        <text fg={theme.error}>{props.message.error?.data.message}</text>
      </Show>
      <Show
        when={
          props.last ||
          final() ||
          props.message.error?.name === "MessageAbortedError"
        }
      >
        <text fg={theme.textMuted}>
          <span style={{ fg: local.agent.color(props.message.agent) }}>✔ </span>
          {Locale.titlecase(props.message.mode)} · {model()}
          <Show when={props.last && status().type !== "idle"}>
            {" "}· Thinking
            <Show when={usage()}>
              {(item) => <> · {[item().context, item().cost].filter(Boolean).join(" · ")}</>}
            </Show>
          </Show>
          <Show when={duration()}> · {Locale.duration(duration())}</Show>
          <Show when={props.message.error?.name === "MessageAbortedError"}>
            {" "}· interrupted
          </Show>
        </text>
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
  const kv = useKV()
  const { theme } = useForkTheme()
  const promptRef = usePromptRef()
  const dialog = useDialog()
  const renderer = useRenderer()
  const sdk = useSDK()
  const editor = useEditorContext()
  const toast = useToast()
  const local = useLocal()
  const dimensions = useTerminalDimensions()
  const setEpilogue = useEpilogue()
  const directory = useDirectory()
  const leaderMenu = createMemo(() => getLeaderMenu(directory()))

  const session = createMemo(() => sync.session.get(route.sessionID))
  const children = createMemo(() => {
    const parentID = session()?.parentID ?? session()?.id
    return sync.data.session
      .filter((x) => x.parentID === parentID || x.id === parentID)
      .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  })
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
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

  const contentWidth = createMemo(() => dimensions().width - 3)

  const thinking = useThinkingMode()
  const thinkingMode = thinking.mode
  const showThinking = createMemo(() => true)

  const providers = createMemo(() => Model.index(sync.data.provider))
  let scroll: any
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
    details: () => true,
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

  useBindings(() => ({
    commands: [
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
        name: "session.toggle.thinking",
        title: "Toggle thinking mode",
        category: "Session",
        run: () => {
          thinking.set(nextThinkingMode(thinkingMode()))
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
    ],
  }))

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
    conceal: () => false,
    thinkingMode,
    showThinking,
    showTimestamps: () => false,
    showDetails: () => true,
    showGenericToolOutput: () => true,
    diffWrapMode: () => "word" as const,
    providers,
    sync,
    tui: tuiConfig,
  }

  return (
    <AutocompleteHostProvider>
      <MinimalRendererBackground />
      <PathFormatterProvider path={session()?.directory}>
        <SessionContext.Provider value={contextValue}>
          <box flexDirection="column" flexGrow={1} minHeight={0} position="relative">
            <Show when={route.sessionID}>
              <MinimalStatusBar sessionID={route.sessionID} />
              <box flexGrow={1} minHeight={0}>
                <box flexGrow={1} minHeight={0}>
                  <scrollbox
                    ref={(r) => (scroll = r)}
                    stickyScroll={true}
                    stickyStart="bottom"
                    flexGrow={1}
                    verticalScrollbarOptions={{ visible: false }}
                    horizontalScrollbarOptions={{ visible: false }}
                  >
                  <For each={messages()}>
                    {(message) => (
                      <box width="100%">
                        <Switch>
                          <Match when={message.role === "user"}>
                            <CompactUserMessage
                               message={message as UserMessageType}
                               parts={sync.data.part[message.id] ?? []}
                            />
                          </Match>
                          <Match when={message.role === "assistant"}>
                            <CompactAssistantMessage
                               last={lastAssistant()?.id === message.id}
                               message={message as AssistantMessage}
                               parts={sync.data.part[message.id] ?? []}
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
                    <PermissionPrompt request={permissions()[0]} />
                  </box>
                </Show>
                <Show
                  when={permissions().length === 0 && questions().length > 0}
                >
                  <QuestionPrompt request={questions()[0]} />
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
      </PathFormatterProvider>
    </AutocompleteHostProvider>
  )
}
