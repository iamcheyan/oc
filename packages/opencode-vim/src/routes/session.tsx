import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { SessionMessageAssistant, SessionMessageInfo, SessionMessageUser, SessionMessageAssistantText, SessionMessageAssistantReasoning, SessionMessageAssistantTool } from "@opencode/client"
import { useTerminalDimensions } from "@opentui/solid"
import { useData } from "../../../tui/src/context/data"
import { useLocation } from "../../../tui/src/context/location"
import { useLocal } from "../../../tui/src/context/local"
import { useClient } from "../../../tui/src/context/client"
import { useRoute } from "../../../tui/src/context/route"
import { useEditorContext } from "../../../tui/src/context/editor"
import { usePromptRef } from "../../../tui/src/context/prompt"
import { useDialog } from "../../../tui/src/ui/dialog"
import { useToast } from "../../../tui/src/ui/toast"
import { Keymap } from "../../../tui/src/context/keymap"
import { useTheme } from "../../../tui/src/context/theme"
import { useEpilogue } from "../../../tui/src/context/epilogue"
import { TextPart, ReasoningPart } from "../../../tui/src/routes/session/message-parts"
import { PermissionPrompt } from "../../../tui/src/routes/session/permission"
import { FormPrompt } from "../../../tui/src/routes/session/form"
import { DialogSessionRename } from "../../../tui/src/component/dialog-session-rename"
import { DialogFork } from "../../../tui/src/routes/session/dialog-fork"
import { DialogTimeline } from "../../../tui/src/routes/session/dialog-timeline"
import { errorMessage } from "../../../tui/src/util/error"
import { SessionContext } from "../context/session-context"
import { MinimalRendererBackground } from "../util/theme"
import { MinimalSessionPromptFooter, MinimalStatusBar } from "../component/minimal-layout"
import { type MinimalPromptRef, type PromptRef } from "../component/prompt"
import { Sidebar } from "../component/sidebar"
import { ModelFreeGuard } from "../component/model-free-guard"
import { ForkModelCommand } from "../component/dialog-model"
import { AutocompleteHostProvider } from "../context/autocomplete-host"
import { createCopyMode } from "../feature/copy-mode"
import { useVimMode, useVimSession, getLeaderMenu } from "../feature/vim-mode"
import { loadVimConfig, saveVimConfig } from "../config/vim"
import { SimpleTool } from "../component/simple-tool"
import { useConfig } from "../../../tui/src/config/index"
import type { SessionContextValue } from "../context/session-context"

export function MinimalSession(props: { sessionID?: string; verticalTabsWidth?: number } = {}) {
  const route = useRoute()
  const { navigate } = route
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
  const sessionID = createMemo(() => props.sessionID ?? (route.data.type === "session" ? route.data.sessionID : ""))
  const session = createMemo(() => data.session.get(sessionID()))
  const messages = createMemo(() => data.session.message.list(sessionID()))
  const permissions = createMemo(() => session()?.parentID ? [] : data.session.family(sessionID()).flatMap((id) => data.session.permission.list(id) ?? []))
  const forms = createMemo(() => {
    const ref = session()?.location ?? location.ref
    const global = data.session.form.list("global", ref) ?? []
    return session()?.parentID ? global : [...data.session.family(sessionID())].flatMap((id) => data.session.form.list(id) ?? []).concat(global)
  })
  const disabled = createMemo(() => permissions().length > 0 || forms().length > 0)
  const visible = createMemo(() => !disabled() && !session()?.parentID)
  const status = createMemo(() => data.session.status(sessionID()))
  const [showThinking, setShowThinking] = createSignal(false)
  const [sidebar, setSidebar] = createSignal(false)
  let scroll: ScrollBoxRenderable | undefined
  let prompt: MinimalPromptRef | undefined
  let seeded = false
  const vimMode = useVimMode()
  const directory = () => session()?.location.directory ?? location.ref?.directory ?? data.location.default().directory
  const menu = createMemo(() => getLeaderMenu(directory()))
  const vimConfig = createMemo(() => loadVimConfig(directory()))
  const vimHidePrompt = createMemo(() => vimConfig().hidePrompt ?? false)
  const vimAutoResume = createMemo(() => vimConfig().autoResume ?? false)
  const pureMode = createMemo(() => vimConfig().pureMode ?? false)
  const hideTools = createMemo(() => vimConfig().hideTools ?? false)
  const autoAllowPermissions = createMemo(() => vimConfig().autoAllowPermissions ?? false)
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
  useVimSession(() => scroll, () => prompt, copyMode, dialog, directory, menu)
  onMount(() => vimMode.enterInsert())

  createEffect(() => {
    if (!autoAllowPermissions()) return
    for (const item of permissions()) {
      void data.session.permission.reply({ sessionID: item.sessionID, requestID: item.id, decision: "always" }).catch(() => undefined)
    }
  })

  createEffect(() => {
    if (client.connection.status() !== "connected") return
    const id = sessionID()
    if (!id) return
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
      if (sessionID() === id) scroll?.scrollTo(scroll.scrollHeight)
    }).catch((error: unknown) => {
      if (sessionID() !== id) return
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
    if (!ref || seeded) return
    seeded = true
    if (route.data.type === "session" && route.data.prompt) {
      ref.set(route.data.prompt)
      return
    }
    ref.set({ text: "", files: [], agents: [], skills: [], pasted: [] })
  }
  const toBottom = () => scroll?.scrollTo(scroll.scrollHeight)
  const jumpToMessage = (messageID?: string) => {
    if (!messageID || !scroll) return
    const node = scroll.content.getRenderable(messageID)
    if (node) scroll.scrollTo(Math.max(0, scroll.scrollTop + node.y - scroll.viewport.y))
  }
  const config = useConfig()
  const context: SessionContextValue = {
    width: dimensions().width - 4,
    sessionID: sessionID(),
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
    { id: "session.toggle.thinking", title: "Toggle thinking", group: "Session", run: () => { setShowThinking((value) => !value); dialog.clear() } },
    { id: "session.sidebar.toggle", title: "Toggle sidebar", group: "Session", run: () => { setSidebar((value) => !value); dialog.clear() } },
    { id: "session.first", title: "First message", group: "Session", run: () => { scroll?.scrollTo(0); dialog.clear() } },
    { id: "session.last", title: "Last message", group: "Session", run: () => { toBottom(); dialog.clear() } },
    { id: "session.rename", title: "Rename session", group: "Session", slash: { name: "rename" }, run: () => { DialogSessionRename.show(dialog, sessionID(), session()?.title) } },
    { id: "session.timeline", title: "Jump to message", group: "Session", slash: { name: "timeline" }, run: () => { dialog.replace(() => <DialogTimeline sessionID={sessionID()} onMove={jumpToMessage} setPrompt={(value) => promptRef.current?.set(value)} />) } },
    { id: "session.fork", title: "Fork session", group: "Session", slash: { name: "fork" }, run: () => { dialog.replace(() => <DialogFork sessionID={sessionID()} onMove={jumpToMessage} />) } },
    { id: "session.compact", title: "Compact session", group: "Session", slash: { name: "compact" }, run: () => {
      const selection = local.model.current()
      void data.session.compact({
        sessionID: sessionID(),
        model: selection ? { providerID: selection.providerID, id: selection.modelID, variant: local.model.variant.current() } : undefined,
      }).catch((error: unknown) => toast.show({ message: errorMessage(error), variant: "error" }))
      dialog.clear()
    } },
    { id: "session.interrupt", title: "Interrupt session", group: "Session", bind: "ctrl+c", run: () => { if (status() === "running") void client.api.session.interrupt({ sessionID: sessionID() }).catch(toast.error) } },
    { id: "vim.toggle.hidePrompt", title: "Toggle vim hide prompt", group: "Vim", run: () => { const next = !vimHidePrompt(); saveVimConfig(directory(), { hidePrompt: next }); toast.show({ message: `Hide prompt: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 }); dialog.clear() } },
    { id: "vim.toggle.autoResume", title: "Toggle vim auto resume", group: "Vim", run: () => { const next = !vimAutoResume(); saveVimConfig(directory(), { autoResume: next }); toast.show({ message: `Auto resume: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 }); dialog.clear() } },
    { id: "vim.toggle.pureMode", title: "Toggle pure mode", group: "Vim", run: () => { const next = !pureMode(); saveVimConfig(directory(), { pureMode: next }); toast.show({ message: `Pure mode: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 }); dialog.clear() } },
    { id: "vim.toggle.hideTools", title: "Toggle hide tools", group: "Vim", run: () => { const next = !hideTools(); saveVimConfig(directory(), { hideTools: next }); toast.show({ message: `Hide tools: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 }); dialog.clear() } },
    { id: "vim.toggle.autoAllowPermissions", title: "Toggle auto-allow permissions", group: "Vim", run: () => { const next = !autoAllowPermissions(); saveVimConfig(directory(), { autoAllowPermissions: next }); toast.show({ message: `Auto-allow permissions: ${next ? "ON" : "OFF"}`, variant: "info", duration: 2000 }); dialog.clear() } },
  ] }))

  return <AutocompleteHostProvider><MinimalRendererBackground /><ModelFreeGuard /><ForkModelCommand />
    <SessionContext.Provider value={context}>
      <box flexDirection="column" flexGrow={1} minHeight={0} position="relative">
        <MinimalStatusBar sessionID={sessionID()} pureMode={pureMode()} />
        <box flexGrow={1} minHeight={0}><scrollbox ref={(value) => { scroll = value }} flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom">
          <For each={messages()}>{(message) => <MessageView message={message} showThinking={showThinking()} hideTools={hideTools()} pureMode={pureMode()} />}</For>
          <Show when={status() !== "idle"}><text fg={theme.text.muted}>● {status()}</text></Show>
        </scrollbox></box>
        <Show when={permissions().length > 0}>{permissions()[0] && <PermissionPrompt request={permissions()[0]!} directory={session()?.location.directory} />}</Show>
        <Show when={permissions().length === 0 && forms().length > 0}>{forms()[0] && <FormPrompt form={forms()[0]!} />}</Show>
        <Show when={session()?.parentID}><text fg={theme.text.muted}>Subagent session · {session()?.parentID}</text></Show>
        <Show when={visible()}><MinimalSessionPromptFooter bind={bind} sessionID={sessionID()} visible={visible()} disabled={disabled()} onSubmit={toBottom} menu={menu()} /></Show>
        <Show when={sidebar()}><box position="absolute" top={2} right={0} width={42} backgroundColor={theme.background.raised.base} zIndex={10}><Sidebar sessionID={sessionID()} compact bare hideFooter /></box></Show>
      </box>
    </SessionContext.Provider>
  </AutocompleteHostProvider>
}

function MessageView(props: { message: SessionMessageInfo; showThinking: boolean; hideTools: boolean; pureMode: boolean }) {
  const theme = useTheme()
  const message = () => props.message
  return <box id={props.message.id} marginTop={1} flexShrink={0}><Switch>
    <Match when={message().type === "user"}>{message().type === "user" ? <UserMessage message={message() as SessionMessageUser} /> : null}</Match>
    <Match when={message().type === "assistant"}>{message().type === "assistant" ? <AssistantMessageView message={message() as SessionMessageAssistant} showThinking={props.showThinking} hideTools={props.hideTools} pureMode={props.pureMode} /> : null}</Match>
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

function AssistantMessageView(props: { message: SessionMessageAssistant; showThinking: boolean; hideTools: boolean; pureMode: boolean }) {
  const theme = useTheme()
  const local = useLocal()
  return <box>
    <For each={props.message.content}>{(part) => <AssistantPart part={part} message={props.message} showThinking={props.showThinking} hideTools={props.hideTools} />}</For>
    <Show when={!props.pureMode}>
      <text fg={theme.text.muted}>{local.agent.current()?.name ?? props.message.agent} · {props.message.model.providerID}/{props.message.model.id}<Show when={props.message.time.completed}> · {props.message.finish}</Show></text>
    </Show>
  </box>
}

function AssistantPart(props: { part: SessionMessageAssistantText | SessionMessageAssistantReasoning | SessionMessageAssistantTool; message: SessionMessageAssistant; showThinking: boolean; hideTools: boolean }) {
  return <Switch>
    <Match when={props.part.type === "text"}>{props.part.type === "text" && <TextPart part={props.part} message={props.message} last />}</Match>
    <Match when={props.part.type === "reasoning"}>{props.part.type === "reasoning" && props.showThinking && <ReasoningPart part={props.part} message={props.message} last />}</Match>
    <Match when={props.part.type === "tool"}>{props.part.type === "tool" && (!props.hideTools || ["edit", "write", "apply_patch"].includes(props.part.name)) && <SimpleTool part={props.part} />}</Match>
  </Switch>
}
