import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import { usePluginRuntime } from "@tui/plugin/runtime"
import { useDirectory } from "@tui/context/directory"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { selectedForeground, useForkTheme } from "@/util/theme"
import { TextAttributes } from "@opentui/core"
import type { AssistantMessage, SessionStatus } from "@opencode-ai/sdk/v2"
import { Locale } from "@/util/locale"
import { useVimMode } from "@/feature/vim-mode"
import { useThinkingMode } from "@tui/context/thinking"
import { formatDuration } from "@tui/util/format"
import { Prompt, type PromptRef } from "@/component/prompt"
import type { LeaderGroup } from "@/feature/leader-menu"

type RetryStatus = Extract<SessionStatus, { type: "retry" }>

export function MinimalStatusBar(props: { sessionID?: string; pureMode?: boolean }) {
  const local = useLocal()
  const directory = useDirectory()
  const sync = useSync()
  const { theme } = useForkTheme()
  const vimMode = useVimMode()
  const thinking = useThinkingMode()
  const status = createMemo(() => {
    if (!props.sessionID) return { type: "idle" as const }
    return sync.data.session_status?.[props.sessionID] ?? { type: "idle" as const }
  })
  const retry = createMemo(() => {
    const current = status()
    if (current.type !== "retry") return
    return current as RetryStatus
  })
  const [retrySeconds, setRetrySeconds] = createSignal(0)

  const agentLabel = createMemo(() =>
    local.agent.current() ? Locale.titlecase(local.agent.current()!.name) : "Agent",
  )
  const modeIsNormal = createMemo(() => vimMode.isNormal())
  const modeBackground = createMemo(() => (modeIsNormal() ? theme.success : theme.primary))
  const modeForeground = createMemo(() => selectedForeground(theme, modeBackground()))
  const retryMessage = createMemo(() => {
    const current = retry()
    if (!current) return
    if (current.message.includes("exceeded your current quota") && current.message.includes("gemini")) {
      return "gemini is way too hot right now"
    }
    if (current.message.length > 80) return current.message.slice(0, 80) + "..."
    return current.message
  })
  const retryText = createMemo(() => {
    const current = retry()
    const message = retryMessage()
    if (!current || !message) return
    const duration = formatDuration(retrySeconds())
    return `${message} [retrying ${duration ? `in ${duration} ` : ""}attempt #${current.attempt}]`
  })

  onMount(() => {
    const timer = setInterval(() => {
      const next = retry()?.next
      if (next) setRetrySeconds(Math.max(0, Math.round((next - Date.now()) / 1000)))
    }, 1000)

    onCleanup(() => clearInterval(timer))
  })

  return (
    <box flexShrink={0} width="100%" flexDirection="row" justifyContent="space-between">
      <box flexDirection="row" gap={1} minWidth={0}>
        <box backgroundColor={modeBackground()} paddingLeft={1} paddingRight={1}>
          <text fg={modeForeground()} attributes={TextAttributes.BOLD}>
            {modeIsNormal() ? "NORMAL" : "INSERT"}
          </text>
        </box>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.textMuted }}>{directory()}</span>
          <Show when={local.model.variant.current()}>
            <span style={{ fg: theme.textMuted }}> · </span>
            <span style={{ fg: theme.warning }}>{local.model.variant.current()}</span>
          </Show>
          <Show when={retryText()}>
            {(text) => (
              <>
                <span style={{ fg: theme.textMuted }}> · </span>
                <span style={{ fg: theme.error }}>{text()}</span>
              </>
            )}
          </Show>
        </text>
      </box>
      <Show
        when={local.model.current()}
        fallback={
          <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
            <span style={{ fg: local.agent.current() ? local.agent.color(local.agent.current()!.name) : theme.textMuted }}>
              {agentLabel()}
            </span>
          </text>
        }
      >
        {(value) => (
          <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
            <span style={{ fg: theme.textMuted }}>
              {thinking.mode() === "show" ? "󰧑" : "󰂛"}
            </span>
            <span style={{ fg: theme.textMuted }}> </span>
            <span style={{ fg: local.agent.current() ? local.agent.color(local.agent.current()!.name) : theme.textMuted }}>
              {agentLabel()}
            </span>
            <Show when={!props.pureMode}>
              <span style={{ fg: theme.textMuted }}> · </span>
              <span style={{ fg: theme.text }}>
                {props.sessionID ? value().modelID : `${local.model.current()!.providerID}/${local.model.current()!.modelID}`}
              </span>
            </Show>
          </text>
        )}
      </Show>
    </box>
  )
}

export function MinimalHomePromptFooter(props: {
  bind: (ref: PromptRef | undefined) => void
  placeholders?: {
    normal?: string[]
    shell?: string[]
  }
  onUpWhenEmpty?: () => void
  onDownWhenEmpty?: () => void
  onEnterEmpty?: () => boolean | void
}) {
  const pluginRuntime = usePluginRuntime()

  return (
    <box flexShrink={0} width="100%">
      <pluginRuntime.Slot name="home_prompt" mode="replace" ref={props.bind}>
        <Prompt
          compact
          ref={props.bind}
          right={<pluginRuntime.Slot name="home_prompt_right" />}
          placeholders={props.placeholders}
          onUpWhenEmpty={props.onUpWhenEmpty}
          onDownWhenEmpty={props.onDownWhenEmpty}
          onEnterEmpty={props.onEnterEmpty}
        />
      </pluginRuntime.Slot>
    </box>
  )
}

export function MinimalSessionPromptFooter(props: {
  bind: (ref: PromptRef | undefined) => void
  sessionID: string
  visible: boolean
  disabled: boolean
  menu?: LeaderGroup[]
  right?: JSX.Element
  onSubmit?: () => void
}) {
  const pluginRuntime = usePluginRuntime()

  return (
    <box flexShrink={0} width="100%">
      <pluginRuntime.Slot
        name="session_prompt"
        mode="replace"
        session_id={props.sessionID}
        visible={props.visible}
        disabled={props.disabled}
        on_submit={props.onSubmit}
        ref={props.bind}
      >
        <Prompt
          compact
          visible={props.visible}
          ref={props.bind}
          disabled={props.disabled}
          onSubmit={props.onSubmit}
          sessionID={props.sessionID}
          menu={props.menu}
          right={props.right ?? <pluginRuntime.Slot name="session_prompt_right" session_id={props.sessionID} />}
        />
      </pluginRuntime.Slot>
    </box>
  )
}
