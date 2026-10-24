import { TextAttributes } from "@opentui/core"
import { Switch, Match, Show, createMemo, For, type JSX } from "solid-js"
import { useForkTheme } from "../util/theme"
import { useSession } from "../upstream/session"
import { usePathFormatter } from "../../../tui/src/context/path-format"
import { useData } from "../../../tui/src/context/data"
import * as Locale from "../util/locale"
import type { JsonValue, SessionMessageAssistantTool as Part } from "@opencode/client"
import { filetype } from "../util/filetype"

const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][0-9;]*[a-zA-Z].*?(?:\x1b\\|$)|[\x80-\x9f]|[\x1b\x9b]\][^\x1b\x9a]*\x07/g

function stripAnsi(text: string): string {
  return text.replace(ansiRegex, "")
}

// Parsed tool output structure
interface ParsedToolOutput {
  path?: string
  type?: "file" | "directory" | "image" | string
  content?: string
  entries?: string[]
  error?: string
  raw: string
}

// Parse tool output XML tags
function parseToolOutput(output: string): ParsedToolOutput {
  const result: ParsedToolOutput = { raw: output }
  
  // Extract path
  const pathMatch = output.match(/<path>(.*?)<\/path>/s)
  if (pathMatch) {
    result.path = pathMatch[1].trim()
  }
  
  // Extract type
  const typeMatch = output.match(/<type>(.*?)<\/type>/s)
  if (typeMatch) {
    result.type = typeMatch[1].trim()
  }
  
  // Extract content
  const contentMatch = output.match(/<content>(.*?)<\/content>/s)
  if (contentMatch) {
    result.content = contentMatch[1]
  }
  
  // Extract entries (for directories)
  const entriesMatch = output.match(/<entries>(.*?)<\/entries>/s)
  if (entriesMatch) {
    const entriesText = entriesMatch[1]
    result.entries = entriesText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("<!--"))
  }
  
  // Extract error
  const errorMatch = output.match(/<error>(.*?)<\/error>/s)
  if (errorMatch) {
    result.error = errorMatch[1].trim()
  }
  
  return result
}

// Check if output contains XML tool tags
function hasToolXmlTags(output: string): boolean {
  return /<(?:path|type|content|entries|error)>/.test(output)
}

function compactLines(text: string, max = 8) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
  const visible = lines.slice(0, max)
  const remaining = Math.max(0, lines.length - visible.length)
  return { visible, remaining }
}

function objectValue(value: JsonValue | string | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function formatCount(count: unknown, singular: string, plural = `${singular}s`) {
  if (typeof count !== "number" || !Number.isFinite(count)) return ""
  return `${count} ${count === 1 ? singular : plural}`
}

function ToolBlock(props: { children: JSX.Element }) {
  return (
    <box flexDirection="column" width="100%" marginTop={1} marginBottom={1}>
      {props.children}
    </box>
  )
}

function ToolHeader(props: { icon: string; label: string; value?: string }) {
  const { theme } = useForkTheme()
  return (
    <box flexDirection="row" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text.base}>
        {props.icon} {props.label}
      </text>
      <Show when={props.value}>
        <text attributes={TextAttributes.BOLD} fg={theme.text.action.primary.base}>
          {props.value}
        </text>
      </Show>
    </box>
  )
}

function DetailLine(props: { children: JSX.Element; tone?: "muted" | "primary" | "error" }) {
  const { theme } = useForkTheme()
  const fg = () => {
    if (props.tone === "primary") return theme.text.action.primary.base
    if (props.tone === "error") return theme.text.feedback.error.base
    return theme.text.muted
  }
  return <text fg={fg()}>{props.children}</text>
}

function OutputPreview(props: { text: string; maxLines?: number }) {
  const { theme } = useForkTheme()
  const lines = createMemo(() => compactLines(props.text, props.maxLines ?? 8))
  return (
    <box flexDirection="column">
      <For each={lines().visible}>{(line) => <text fg={theme.text.muted}>{line}</text>}</For>
      <Show when={lines().remaining > 0}>
        <text fg={theme.text.muted}>... {lines().remaining} more lines</text>
      </Show>
    </box>
  )
}

// Component to display parsed read output
function ParsedReadOutput(props: { output: string; maxEntries?: number }) {
  const { theme } = useForkTheme()
  const parsed = createMemo(() => parseToolOutput(props.output))
  const entries = createMemo(() => {
    const all = parsed().entries ?? []
    const visible = all.slice(0, props.maxEntries ?? 5)
    return { visible, remaining: Math.max(0, all.length - visible.length) }
  })
  
  return (
    <box flexDirection="column" width="100%">
      {/* File or directory path */}
      <Show when={parsed().path}>
        <text fg={theme.text.action.primary.base}>{parsed().path}/</text>
      </Show>
      
      {/* Directory entries */}
      <Show when={parsed().entries && parsed().entries!.length > 0}>
        <box paddingLeft={2}>
          <For each={entries().visible}>
            {(entry) => (
              <text fg={theme.text.muted}>{entry}</text>
            )}
          </For>
          <Show when={entries().remaining > 0}>
            <text fg={theme.text.muted}>... {entries().remaining} more entries</text>
          </Show>
        </box>
      </Show>
      
      {/* Error */}
      <Show when={parsed().error}>
        <text fg={theme.text.feedback.error.base}>{parsed().error}</text>
      </Show>
      
      {/* Fallback: empty */}
      <Show when={!parsed().path && !parsed().entries && !parsed().error}>
        <text fg={theme.text.muted}>(empty)</text>
      </Show>
    </box>
  )
}

type Diagnostic = { severity?: string; message?: string }

// Diagnostics display for write/edit with errors
function Diagnostics(props: { diagnostics: Diagnostic[]; filePath: string }) {
  const { theme } = useForkTheme()
  return (
    <For each={props.diagnostics}>
      {(diag) => (
        <text fg={diag.severity === "error" ? theme.text.feedback.error.base : theme.text.feedback.warning.base}>
          {diag.message}
        </text>
      )}
    </For>
  )
}

// Todo item display
function TodoItem(props: { status: string; content: string }) {
  const { theme } = useForkTheme()
  const icon = () => {
    if (props.status === "completed") return "✓"
    if (props.status === "in_progress") return "◐"
    return "○"
  }
  const fg = () => {
    if (props.status === "completed") return theme.text.muted
    if (props.status === "in_progress") return theme.text.action.primary.base
    return theme.text.base
  }
  return (
    <text fg={fg()}>
      {icon()} {props.content}
    </text>
  )
}

// Web search provider label
interface SimpleToolProps {
  part: Part & { type: "tool" }
}

export function SimpleTool(props: SimpleToolProps) {
  const { theme, syntax } = useForkTheme()
  const ctx = useSession()
  const pathFormatter = usePathFormatter()
  const data = useData()
  const tool = () => props.part
  const state = () => tool().state
  const input = () => objectValue(tool().state.input)
  const metadata = () => {
    const current = state()
    return "metadata" in current ? objectValue(current.metadata) : {}
  }
  const numberMetadata = (key: string) => typeof metadata()[key] === "number" ? metadata()[key] as number : undefined
  const arrayMetadata = <T,>(key: string) => arrayValue<T>(metadata()[key])
  const output = () => {
    const current = state()
    const raw = "output" in current ? current.output || "" : ""
    if (!raw) return ""
    return stripAnsi(typeof raw === "string" ? raw : "").replace(/^[\n\r]+|[\n\r]+$/g, "").replace(/\n{2,}/g, "\n")
  }
  const status = () => state().status
  const error = () => {
    const current = state()
    return current.status === "error" && "error" in current ? current.error : undefined
  }

  // Detect filetype from path
  const ft = createMemo(() => {
    const fp = stringValue(input().filePath) ?? ""
    if (fp) return filetype(fp)
    return ""
  })

  // Diff view mode
  const view = createMemo(() => {
    const diffStyle = ctx.config.data.diffs?.view
    if (diffStyle === "unified") return "unified"
    if (diffStyle === "split") return "split"
    return ctx.width > 120 ? "split" : "unified"
  })

  // Task specific data
  const taskSessionID = () => stringValue(metadata().sessionId)
  const taskMessages = createMemo(() => {
    const sessionID = taskSessionID()
    if (tool().name !== "task" || !sessionID) return []
    return data.session.message.list(sessionID)
  })

  const taskTools = createMemo(() => taskMessages().flatMap((message) =>
    message.type === "assistant"
      ? message.content.filter((part): part is Part => part.type === "tool")
      : [],
  ))

  const taskCurrent = createMemo(() => taskTools().findLast((part) =>
    (part.state.status === "running" || part.state.status === "completed") && "title" in part.state && part.state.title,
  ))

  const taskCurrentTitle = () => {
    const current = taskCurrent()
    return current && "title" in current.state ? current.state.title || "" : ""
  }

  const taskDuration = createMemo(() => {
    const messages = taskMessages()
    const first = messages.find((message) => message.type === "user")?.time.created
    const assistant = messages.findLast((message) => message.type === "assistant")
    if (!first || !assistant || assistant.type !== "assistant" || !assistant.time.completed) return 0
    return assistant.time.completed - first
  })

  return (
    <Switch>
      {/* Bash/Shell */}
      <Match when={tool().name === "bash" || tool().name === "shell"}>
        <ToolBlock>
          <ToolHeader icon="$" label={String(stringValue(input().command) ?? "Shell")} />
          <Show when={output()}>
            <OutputPreview text={output()} maxLines={10} />
          </Show>
          <Show when={error()}>
            <DetailLine tone="error">{JSON.stringify(error())}</DetailLine>
          </Show>
        </ToolBlock>
      </Match>

      {/* Write with diagnostics */}
      <Match when={(tool().name === "write" || tool().name === "editor_write") && metadata().diagnostics !== undefined}>
        <ToolBlock>
          <ToolHeader
            icon="✎"
            label={tool().name === "write" ? "Wrote" : "Write"}
            value={pathFormatter.format(stringValue(input().filePath) ?? "")}
          />
          <box paddingLeft={2}>
            <code
              filetype={ft()}
              syntaxStyle={syntax()}
              content={stringValue(input().content) ?? output()}
              fg={theme.text.muted}
              drawUnstyledText={false}
            />
          </box>
          <Diagnostics diagnostics={arrayMetadata<Diagnostic>("diagnostics")} filePath={stringValue(input().filePath) ?? ""} />
        </ToolBlock>
      </Match>

      {/* Write without diagnostics */}
      <Match when={tool().name === "write" || tool().name === "editor_write"}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Write" value={pathFormatter.format(stringValue(input().filePath) ?? "")} />
        </ToolBlock>
      </Match>

      {/* Edit with diff */}
      <Match when={tool().name === "edit" && metadata().diff !== undefined}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Edit" value={pathFormatter.format(stringValue(input().filePath) ?? "")} />
          <diff
            diff={metadata().diff}
            view={view()}
            filetype={ft()}
            syntaxStyle={syntax()}
            showLineNumbers={true}
            width="100%"
            wrapMode={ctx.diffWrapMode()}
            fg={theme.text.muted}
            addedBg={theme.diff.background.added}
            removedBg={theme.diff.background.removed}
            contextBg={theme.diff.background.context}
            addedSignColor={theme.diff.highlight.added}
            removedSignColor={theme.diff.highlight.removed}
            lineNumberFg={theme.diff.lineNumber.text}
            lineNumberBg={theme.diff.background.context}
            addedLineNumberBg={theme.diff.lineNumber.background.added}
            removedLineNumberBg={theme.diff.lineNumber.background.removed}
          />
        </ToolBlock>
      </Match>

      {/* Edit without diff */}
      <Match when={tool().name === "edit"}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Edit" value={pathFormatter.format(stringValue(input().filePath) ?? "")} />
        </ToolBlock>
      </Match>

      {/* Read */}
      <Match when={tool().name === "read"}>
        <ToolBlock>
          <ToolHeader icon="→" label="Read" value={pathFormatter.format(stringValue(input().filePath) ?? "")} />
          <Show when={arrayValue<string>(metadata().loaded).length > 0}>
            <For each={arrayValue<string>(metadata().loaded).slice(0, 5)}>
              {(filepath: string) => (
                <DetailLine>Loaded {pathFormatter.format(filepath)}</DetailLine>
              )}
            </For>
            <Show when={arrayValue<string>(metadata().loaded).length > 5}>
              <DetailLine>... {arrayValue<string>(metadata().loaded).length - 5} more files</DetailLine>
            </Show>
          </Show>
          <Show when={output() && status() === "completed"}>
            <Show when={hasToolXmlTags(output())} fallback={<OutputPreview text={output()} maxLines={6} />}>
              <ParsedReadOutput output={output()} maxEntries={5} />
            </Show>
          </Show>
        </ToolBlock>
      </Match>

      {/* Glob */}
      <Match when={tool().name === "glob"}>
        <ToolBlock>
          <ToolHeader icon="✱" label="Glob" value={`"${stringValue(input().pattern)}"`} />
          <Show when={numberMetadata("count")}>
            <DetailLine>Found {formatCount(numberMetadata("count"), "match", "matches")}</DetailLine>
          </Show>
          <Show when={stringValue(input().path)}>
            <DetailLine>{pathFormatter.format(stringValue(input().path))}</DetailLine>
          </Show>
          <Show when={output() && status() === "completed"}>
            <OutputPreview text={output()} maxLines={5} />
          </Show>
        </ToolBlock>
      </Match>

      {/* Grep */}
      <Match when={tool().name === "grep"}>
        <ToolBlock>
          <ToolHeader icon="✱" label="Grep" value={`"${stringValue(input().pattern)}"`} />
          <Show when={numberMetadata("matches")}>
            <DetailLine>Found {formatCount(numberMetadata("matches"), "match", "matches")}</DetailLine>
          </Show>
          <Show when={stringValue(input().path)}>
            <DetailLine>{pathFormatter.format(stringValue(input().path))}</DetailLine>
          </Show>
          <Show when={output() && status() === "completed"}>
            <OutputPreview text={output()} maxLines={5} />
          </Show>
        </ToolBlock>
      </Match>

      {/* WebFetch */}
      <Match when={tool().name === "webfetch"}>
        <ToolBlock>
          <ToolHeader icon="⬇" label="WebFetch" value={stringValue(input().url)} />
          <Show when={output()}>
            <OutputPreview text={output()} maxLines={6} />
          </Show>
        </ToolBlock>
      </Match>

      {/* WebSearch */}
      <Match when={tool().name === "websearch"}>
        <ToolBlock>
          <ToolHeader icon="◈" label="WebSearch" value={`"${stringValue(input().query)}"`} />
          <Show when={numberMetadata("numResults")}>
            <DetailLine>{formatCount(numberMetadata("numResults"), "result")}</DetailLine>
          </Show>
        </ToolBlock>
      </Match>

      {/* Task (Subagent) */}
      <Match when={tool().name === "task"}>
        <ToolBlock>
          <ToolHeader icon="⚙" label={`${Locale.titlecase(stringValue(input().subagent_type) ?? "General")} Task`} value={stringValue(input().description)} />
          <Show when={metadata().background === true}>
            <DetailLine>background</DetailLine>
          </Show>
          <Show when={status() === "running" && taskTools().length > 0}>
            <DetailLine>
              → {taskCurrent() 
                ? `${Locale.titlecase(taskCurrent()!.name)} ${taskCurrentTitle()}`
                : `${taskTools().length} tool calls`
              }
            </DetailLine>
          </Show>
          <Show when={status() === "completed"}>
            <DetailLine>
              ✓ {taskTools().length} tool calls
              <Show when={!metadata().background}> · {Locale.duration(taskDuration())}</Show>
            </DetailLine>
          </Show>
        </ToolBlock>
      </Match>

      {/* ApplyPatch */}
      <Match when={tool().name === "apply_patch" && Array.isArray((arrayMetadata<{ path: string; diff?: string }>("files"))) && (arrayMetadata<{ path: string; diff?: string }>("files")).length > 0}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Apply Patch" />
          <For each={(arrayMetadata<{ path: string; diff?: string }>("files"))}>
            {(file: { path: string; diff?: string }) => (
              <box flexDirection="column" gap={1}>
                <text fg={theme.text.action.primary.base}>{file.path}</text>
                <Show when={file.diff}>
                  <diff
                    diff={file.diff}
                    view={view()}
                    filetype={filetype(file.path)}
                    syntaxStyle={syntax()}
                    showLineNumbers={true}
                    width="100%"
                    wrapMode={ctx.diffWrapMode()}
                    fg={theme.text.muted}
                    addedBg={theme.diff.background.added}
                    removedBg={theme.diff.background.removed}
                    contextBg={theme.diff.background.context}
                    addedSignColor={theme.diff.highlight.added}
                    removedSignColor={theme.diff.highlight.removed}
                    lineNumberFg={theme.diff.lineNumber.text}
                    lineNumberBg={theme.diff.background.context}
                    addedLineNumberBg={theme.diff.lineNumber.background.added}
                    removedLineNumberBg={theme.diff.lineNumber.background.removed}
                  />
                </Show>
              </box>
            )}
          </For>
        </ToolBlock>
      </Match>

      <Match when={tool().name === "apply_patch"}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Apply Patch" />
        </ToolBlock>
      </Match>

      {/* TodoWrite */}
      <Match when={tool().name === "todowrite" && arrayMetadata<{ status: string; content: string }>("todos").length > 0}>
        <ToolBlock>
          <ToolHeader icon="☐" label="Todos" />
          <For each={(arrayMetadata<{ status: string; content: string }>("todos"))}>
            {(todo: { status: string; content: string }) => (
              <TodoItem status={todo.status} content={todo.content} />
            )}
          </For>
        </ToolBlock>
      </Match>

      <Match when={tool().name === "todowrite"}>
        <ToolBlock>
          <ToolHeader icon="☐" label="Updating todos..." />
        </ToolBlock>
      </Match>

      {/* Question */}
      <Match when={tool().name === "question" && arrayMetadata<string[]>("answers")}>
        <ToolBlock>
          <ToolHeader icon="?" label="Questions" />
          <For each={arrayValue<{ question: string }>(input().questions)}>
            {(q: { question: string }, i: () => number) => (
              <box flexDirection="column">
                <DetailLine>Q: {q.question}</DetailLine>
                <DetailLine tone="primary">A: {arrayValue<string[]>(arrayMetadata<string[]>("answers"))[i()]?.join(", ") || "(no answer)"}</DetailLine>
              </box>
            )}
          </For>
        </ToolBlock>
      </Match>

      <Match when={tool().name === "question"}>
        <ToolBlock>
          <ToolHeader icon="?" label={`Asked ${arrayValue<{ question: string }>(input().questions)?.length || 0} question${arrayValue<{ question: string }>(input().questions)?.length !== 1 ? "s" : ""}`} />
        </ToolBlock>
      </Match>

      {/* Skill */}
      <Match when={tool().name === "skill"}>
        <ToolBlock>
          <ToolHeader icon="⚡" label="Skill" value={stringValue(input().name)} />
        </ToolBlock>
      </Match>

      {/* Generic tool fallback */}
      <Match when={true}>
        <ToolBlock>
          <ToolHeader icon="⚙" label={tool().name} />
          <Show when={stringValue(input().command) ?? stringValue(input().filePath) ?? stringValue(input().pattern) ?? stringValue(input().description)}>
            <DetailLine>{stringValue(input().command) ?? stringValue(input().filePath) ?? stringValue(input().pattern) ?? stringValue(input().description)}</DetailLine>
          </Show>
          <Show when={output()}>
            <OutputPreview text={output()} maxLines={6} />
          </Show>
          <Show when={error()}>
            <DetailLine tone="error">{JSON.stringify(error())}</DetailLine>
          </Show>
        </ToolBlock>
      </Match>
    </Switch>
  )
}
