import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { SessionMessageAssistant, SessionMessageInfo, SessionMessageUser, SessionMessageAssistantText, SessionMessageAssistantReasoning, SessionMessageAssistantTool } from "@opencode/client"
import { useTerminalDimensions } from "@opentui/solid"
import { useData } from "@tui/context/data"
import { useLocation } from "@tui/context/location"
import { useLocal } from "@tui/context/local"
import { useClient } from "@tui/context/client"
import { useRoute } from "@tui/context/route"
import { useEditorContext } from "@tui/context/editor"
import { usePromptRef } from "@tui/context/prompt"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { Keymap } from "@tui/context/keymap"
import { useTheme } from "@tui/context/theme"
import { useEpilogue } from "@tui/context/epilogue"
import { TextPart, ReasoningPart } from "@tui/routes/session/message-parts"
import { PermissionPrompt } from "@tui/routes/session/permission"
import { FormPrompt } from "@tui/routes/session/form"
import { errorMessage } from "@tui/util/error"
import { SessionContext } from "@/context/session-context"
import { MinimalRendererBackground } from "@/util/theme"
import { MinimalSessionPromptFooter, MinimalStatusBar } from "@/component/minimal-layout"
import { type MinimalPromptRef, type PromptRef } from "@/component/prompt"
import { Sidebar } from "@/component/sidebar"
import { ModelFreeGuard } from "@/component/model-free-guard"
import { ForkModelCommand } from "@/component/dialog-model"
import { AutocompleteHostProvider } from "@/context/autocomplete-host"
import { createCopyMode } from "@/feature/copy-mode"
import { useVimMode, useVimSession, getLeaderMenu } from "@/feature/vim-mode"
import { SimpleTool } from "@/component/simple-tool"
import { useConfig } from "@tui/config"
import type { SessionContextValue } from "@/context/session-context"

export function MinimalSession(props: { sessionID: string }) {
  const { navigate } = useRoute()
  const data = useData()
  const location = useLocation()
  const local = useLocal()
  const client = useClient()
  const editor = useEditorContext()
  const promptRef = usePromptRef()
  const dialog = useDialog()
  const toast = useToast()
  const theme = useTheme()
  const dimensions = useTerminalDimensions()
  const setEpilogue = useEpilogue()
  const session = createMemo(() => data.session.get(props.sessionID))
  const messages = createMemo(() => data.session.message.list(props.sessionID))
  const permissions = createMemo(() => session()?.parentID ? [] : data.session.family(props.sessionID).flatMap((id) => data.session.permission.list(id) ?? []))
  const forms = createMemo(() => {
    const ref = session()?.location ?? location.ref
    const global = data.session.form.list("global", ref) ?? []
    return session()?.parentID ? global : [...data.session.family(props.sessionID)].flatMap((id) => data.session.form.list(id) ?? []).concat(global)
  })
  const disabled = createMemo(() => permissions().length > 0 || forms().length > 0)
  const visible = createMemo(() => !disabled() && !session()?.parentID)
  const status = createMemo(() => data.session.status(props.sessionID))
  const [showThinking, setShowThinking] = createSignal(false)
  const [sidebar, setSidebar] = createSignal(false)
  let scroll: ScrollBoxRenderable | undefined
  let prompt: MinimalPromptRef | undefined
  let seeded = false
  const vimMode = useVimMode()
  const menu = createMemo(() => getLeaderMenu(location.ref?.directory ?? data.location.default().directory))
  const copyMode = createCopyMode({
    scroll: () => scroll,
    messages: () => messages().flatMap((message) => message.type === "user" ? [{ id: message.id, role: "user" }] : message.type === "assistant" ? [{ id: message.id, role: "assistant" }] : []),
    parts: (id) => {
      const message = messages().find((item) => item.id === id)
      return message?.type === "assistant" ? message.content.map((part) => ({
        type: part.type,
        id: part.type === "tool" ? part.id : undefined,
        name: part.type === "tool" ? part.name : undefined,
        state: part.type === "tool" ? { status: part.state.status } : undefined,
      })) : []
    },
    thinking: showThinking,
    details: () => true,
  })
  useVimSession(() => scroll, () => prompt, copyMode, dialog, () => location.ref?.directory ?? "", menu)
  onMount(() => vimMode.enterInsert())

  createEffect(() => {
    if (client.connection.status() !== "connected") return
    const id = props.sessionID
    void Promise.all([
      data.session.sync(id, { children: true }),
      data.session.permission.sync(id).catch(() => undefined),
      data.session.form.sync(id).catch(() => undefined),
    ]).then(() => {
      const info = data.session.get(id)
      if (!info) {
        toast.show({ message: `Session not found: ${id}`, variant: "error", duration: 5000 })
        navigate({ type: "home" })
        return
      }
      editor.reconnect(info.location.directory)
      if (props.sessionID === id) scroll?.scrollTo(scroll.scrollHeight)
    }).catch((error: unknown) => {
      if (props.sessionID !== id) return
      toast.show({ message: errorMessage(error), variant: "error", duration: 5000 })
      navigate({ type: "home" })
    })
  })

  createEffect(() => setEpilogue.session({ title: session()?.title ?? "", sessionID: session()?.id }))
  onCleanup(() => setEpilogue.session())
  createEffect(() => {
    if (local.agent.current()) return
    const agent = (data.location.agent.list(session()?.location ?? location.ref) ?? []).find((item) => item.mode !== "subagent" && !item.hidden)
    if (agent) local.agent.set(agent.name)
  })

  const bind = (ref: PromptRef | undefined) => {
    prompt = ref as MinimalPromptRef | undefined
    promptRef.set(ref)
    if (!ref) return
    seeded = true
    ref.set({ text: "", files: [], agents: [], skills: [], pasted: [] })
  }
  const toBottom = () => scroll?.scrollTo(scroll.scrollHeight)
  const config = useConfig()
  const context: SessionContextValue = {
    width: dimensions().width - 4,
    sessionID: props.sessionID,
    conceal: () => true,
    thinkingMode: () => showThinking() ? "show" : "hide",
    showThinking,
    showTimestamps: () => false,
    showDetails: () => true,
    showGenericToolOutput: () => false,
    diffWrapMode: () => config.data.diffs?.wrap ?? "word",
    providers: () => new Map(data.location.provider.list(session()?.location ?? location.ref)?.map((provider) => [provider.id, provider]) ?? []),
    sync: data,
    tui: config,
    config,
  }

  Keymap.createLayer(() => ({ mode: "global", commands: [
    { id: "session.toggle.thinking", title: "Toggle thinking", group: "Session", run: () => { setShowThinking((value) => !value) } },
    { id: "session.sidebar.toggle", title: "Toggle sidebar", group: "Session", run: () => { setSidebar((value) => !value) } },
    { id: "session.last", title: "Last message", group: "Session", run: toBottom },
    { id: "session.interrupt", title: "Interrupt session", group: "Session", bind: "ctrl+c", run: () => { if (status() === "running") void client.api.session.interrupt({ sessionID: props.sessionID }).catch(toast.error) } },
  ] }))

  return <AutocompleteHostProvider><MinimalRendererBackground /><ModelFreeGuard /><ForkModelCommand />
    <SessionContext.Provider value={context}>
      <box flexDirection="column" flexGrow={1} minHeight={0} position="relative">
        <MinimalStatusBar sessionID={props.sessionID} />
        <box flexGrow={1} minHeight={0}><scrollbox ref={(value) => { scroll = value }} flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom">
          <For each={messages()}>{(message) => <MessageView message={message} showThinking={showThinking()} />}</For>
          <Show when={status() !== "idle"}><text fg={theme.text.muted}>● {status()}</text></Show>
        </scrollbox></box>
        <Show when={permissions().length > 0}>{permissions()[0] && <PermissionPrompt request={permissions()[0]!} directory={session()?.location.directory} />}</Show>
        <Show when={permissions().length === 0 && forms().length > 0}>{forms()[0] && <FormPrompt form={forms()[0]!} />}</Show>
        <Show when={session()?.parentID}><text fg={theme.text.muted}>Subagent session · {session()?.parentID}</text></Show>
        <Show when={visible()}><MinimalSessionPromptFooter bind={bind} sessionID={props.sessionID} visible={visible()} disabled={disabled()} onSubmit={toBottom} menu={menu()} /></Show>
        <Show when={sidebar()}><box position="absolute" top={2} right={0} width={42} backgroundColor={theme.background.raised.base} zIndex={10}><Sidebar sessionID={props.sessionID} compact bare hideFooter /></box></Show>
      </box>
    </SessionContext.Provider>
  </AutocompleteHostProvider>
}

function MessageView(props: { message: SessionMessageInfo; showThinking: boolean }) {
  const theme = useTheme()
  const local = useLocal()
  const message = () => props.message
  return <box id={props.message.id} marginTop={1} flexShrink={0}><Switch>
    <Match when={message().type === "user"}>{message().type === "user" ? <UserMessage message={message() as SessionMessageUser} /> : null}</Match>
    <Match when={message().type === "assistant"}>{message().type === "assistant" ? <AssistantMessageView message={message() as SessionMessageAssistant} showThinking={props.showThinking} /> : null}</Match>
    <Match when={message().type === "system"}>{message().type === "system" ? <text fg={theme.text.muted}>{(message() as Extract<SessionMessageInfo, { type: "system" }>).description ?? "Instructions updated"}</text> : null}</Match>
    <Match when={message().type === "synthetic"}>{message().type === "synthetic" ? <text fg={theme.text.muted}>{(message() as Extract<SessionMessageInfo, { type: "synthetic" }>).description ?? (message() as Extract<SessionMessageInfo, { type: "synthetic" }>).text}</text> : null}</Match>
    <Match when={message().type === "compaction"}><text fg={theme.text.muted}>— Compacted —</text></Match>
    <Match when={message().type === "idle"}><text fg={theme.text.feedback.error.base}>Session idle</text></Match>
    <Match when={message().type === "shell"}>{message().type === "shell" ? <text fg={theme.text.muted}>$ {(message() as Extract<SessionMessageInfo, { type: "shell" }>).command}</text> : null}</Match>
    <Match when={message().type === "skill"}>{message().type === "skill" ? <text fg={theme.text.muted}>skill · {(message() as Extract<SessionMessageInfo, { type: "skill" }>).name}</text> : null}</Match>
    <Match when={message().type === "agent-switched" || message().type === "model-switched" || message().type === "location-switched"}>
      <text fg={theme.text.muted}>Session context changed</text>
    </Match>
  </Switch>
  <Show when={message().type === "assistant"}>{message().type === "assistant" ? <text fg={theme.text.muted}>{local.agent.current()?.name ?? (message() as SessionMessageAssistant).agent}</text> : null}</Show>
  </box>
}

function UserMessage(props: { message: SessionMessageUser }) {
  const theme = useTheme()
  return <box paddingLeft={1} border={["left"]} borderColor={theme.text.action.primary.base}>
    <text>{props.message.text}</text>
    <For each={props.message.files ?? []}>{(file) => <text fg={theme.text.muted}>File · {file.name}</text>}</For>
    <For each={props.message.skills ?? []}>{(skill) => <text fg={theme.text.muted}>skill · {skill.name}</text>}</For>
  </box>
}

function AssistantMessageView(props: { message: SessionMessageAssistant; showThinking: boolean }) {
  const theme = useTheme()
  const local = useLocal()
  return <box>
    <For each={props.message.content}>{(part) => <AssistantPart part={part} message={props.message} showThinking={props.showThinking} />}</For>
    <text fg={theme.text.muted}>{local.agent.current()?.name ?? props.message.agent} · {props.message.model.providerID}/{props.message.model.id}<Show when={props.message.time.completed}> · {props.message.finish}</Show></text>
  </box>
}

function AssistantPart(props: { part: SessionMessageAssistantText | SessionMessageAssistantReasoning | SessionMessageAssistantTool; message: SessionMessageAssistant; showThinking: boolean }) {
  return <Switch>
    <Match when={props.part.type === "text"}>{props.part.type === "text" && <TextPart part={props.part} message={props.message} last />}</Match>
    <Match when={props.part.type === "reasoning"}>{props.part.type === "reasoning" && props.showThinking && <ReasoningPart part={props.part} message={props.message} last />}</Match>
    <Match when={props.part.type === "tool"}>{props.part.type === "tool" && <SimpleTool part={props.part} />}</Match>
  </Switch>
}
