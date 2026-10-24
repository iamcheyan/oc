import { createMemo, createSignal, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import { useLocation } from "../../../tui/src/context/location"
import { useLocal } from "../../../tui/src/context/local"
import { selectedForeground, useForkTheme } from "../util/theme"
import { TextAttributes } from "@opentui/core"
import { Locale } from "../util/locale"
import { useVimMode } from "../feature/vim-mode"
import { Prompt, type PromptRef } from "./prompt"
import type { LeaderGroup } from "../feature/leader-menu"

export function MinimalStatusBar(props: { sessionID?: string; pureMode?: boolean }) {
  const local = useLocal()
  const location = useLocation()
  const directory = () => location.ref?.directory ?? ""
  const { theme } = useForkTheme()
  const vimMode = useVimMode()
  const [thinkingMode, setThinkingMode] = createSignal(false)
  const thinking = { mode: thinkingMode, toggle: () => setThinkingMode((mode) => !mode) }
  const modeIsNormal = createMemo(() => vimMode.isNormal())
  const modeBackground = createMemo(() => (modeIsNormal() ? theme.text.feedback.success.base : theme.text.action.primary.base))
  const modeForeground = createMemo(() => selectedForeground(theme, modeBackground()))
  const agentLabel = createMemo(() =>
    local.agent.current() ? Locale.titlecase(local.agent.current()!.name) : "Agent",
  )


  return (
    <box flexShrink={0} width="100%" flexDirection="row" justifyContent="space-between">
      <box flexDirection="row" gap={1} minWidth={0}>
        <box backgroundColor={modeBackground()} paddingLeft={1} paddingRight={1}>
          <text fg={modeForeground()} attributes={TextAttributes.BOLD}>
            {modeIsNormal() ? "NORMAL" : "INSERT"}
          </text>
        </box>
        <text fg={theme.text.muted}>
          <span style={{ fg: theme.text.muted }}>{directory()}</span>
          <Show when={local.model.variant.current()}>
            <span style={{ fg: theme.text.muted }}> · </span>
            <span style={{ fg: theme.text.feedback.warning.base }}>{local.model.variant.current()}</span>
          </Show>
        </text>
      </box>
      <Show
        when={local.model.current()}
        fallback={
          <text fg={theme.text.muted} wrapMode="none" flexShrink={0}>
            <span style={{ fg: local.agent.current() ? local.agent.color(local.agent.current()!.name) : theme.text.muted }}>
              {agentLabel()}
            </span>
          </text>
        }
      >
        {(value) => (
          <text fg={theme.text.muted} wrapMode="none" flexShrink={0}>
            <span style={{ fg: theme.text.muted }}>{thinking.mode() ? "󰧑" : "󰂛"}</span>
            <span style={{ fg: theme.text.muted }}> </span>
            <span style={{ fg: local.agent.current() ? local.agent.color(local.agent.current()!.name) : theme.text.muted }}>
              {agentLabel()}
            </span>
            <Show when={!props.pureMode}>
              <span style={{ fg: theme.text.muted }}> · </span>
              <span style={{ fg: theme.text.base }}>
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
  menu?: LeaderGroup[]
  placeholders?: { normal?: string[]; shell?: string[] }
  onUpWhenEmpty?: () => void
  onDownWhenEmpty?: () => void
  onEnterEmpty?: () => boolean | void
}) {
  return (
    <box flexShrink={0} width="100%">
      <Prompt
        compact
        ref={props.bind}
        menu={props.menu}
        placeholders={props.placeholders}
        onUpWhenEmpty={props.onUpWhenEmpty}
        onDownWhenEmpty={props.onDownWhenEmpty}
        onEnterEmpty={props.onEnterEmpty}
      />
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
  return (
    <box flexShrink={0} width="100%">
      <Prompt
        compact
        visible={props.visible}
        ref={props.bind}
        disabled={props.disabled}
        onSubmit={props.onSubmit}
        sessionID={props.sessionID}
        menu={props.menu}
        right={props.right}
      />
    </box>
  )
}
