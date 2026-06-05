import { TextAttributes } from "@opentui/core"
import { Switch, Match, Show, createMemo, For } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useSession } from "@/upstream/session"
import { usePathFormatter } from "@tui/context/path-format"
import { useSync } from "@tui/context/sync"
import { Locale } from "@/util/locale"
import type { Part } from "@opencode-ai/sdk/v2"
import { filetype } from "@/util/filetype"

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

function formatCount(count: unknown, singular: string, plural = `${singular}s`) {
  if (typeof count !== "number" || !Number.isFinite(count)) return ""
  return `${count} ${count === 1 ? singular : plural}`
}

function ToolBlock(props: { children: any }) {
  return (
    <box flexDirection="column" width="100%" marginTop={1} marginBottom={1}>
      {props.children}
    </box>
  )
}

function ToolHeader(props: { icon: string; label: string; value?: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        {props.icon} {props.label}
      </text>
      <Show when={props.value}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          {props.value}
        </text>
      </Show>
    </box>
  )
}

function DetailLine(props: { children: any; tone?: "muted" | "primary" | "error" }) {
  const { theme } = useTheme()
  const fg = () => {
    if (props.tone === "primary") return theme.primary
    if (props.tone === "error") return theme.error
    return theme.textMuted
  }
  return <text fg={fg()}>{props.children}</text>
}

function OutputPreview(props: { text: string; maxLines?: number }) {
  const { theme } = useTheme()
  const lines = createMemo(() => compactLines(props.text, props.maxLines ?? 8))
  return (
    <box flexDirection="column">
      <For each={lines().visible}>{(line) => <text fg={theme.textMuted}>{line}</text>}</For>
      <Show when={lines().remaining > 0}>
        <text fg={theme.textMuted}>... {lines().remaining} more lines</text>
      </Show>
    </box>
  )
}

// Component to display parsed read output
function ParsedReadOutput(props: { output: string; maxEntries?: number }) {
  const { theme } = useTheme()
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
        <text fg={theme.primary}>{parsed().path}/</text>
      </Show>
      
      {/* Directory entries */}
      <Show when={parsed().entries && parsed().entries!.length > 0}>
        <box paddingLeft={2}>
          <For each={entries().visible}>
            {(entry) => (
              <text fg={theme.textMuted}>{entry}</text>
            )}
          </For>
          <Show when={entries().remaining > 0}>
            <text fg={theme.textMuted}>... {entries().remaining} more entries</text>
          </Show>
        </box>
      </Show>
      
      {/* Error */}
      <Show when={parsed().error}>
        <text fg={theme.error}>{parsed().error}</text>
      </Show>
      
      {/* Fallback: empty */}
      <Show when={!parsed().path && !parsed().entries && !parsed().error}>
        <text fg={theme.textMuted}>(empty)</text>
      </Show>
    </box>
  )
}

// Diagnostics display for write/edit with errors
function Diagnostics(props: { diagnostics: any[]; filePath: string }) {
  const { theme } = useTheme()
  return (
    <For each={props.diagnostics}>
      {(diag) => (
        <text fg={diag.severity === "error" ? theme.error : theme.warning}>
          {diag.message}
        </text>
      )}
    </For>
  )
}

// Todo item display
function TodoItem(props: { status: string; content: string }) {
  const { theme } = useTheme()
  const icon = () => {
    if (props.status === "completed") return "✓"
    if (props.status === "in_progress") return "◐"
    return "○"
  }
  const fg = () => {
    if (props.status === "completed") return theme.textMuted
    if (props.status === "in_progress") return theme.primary
    return theme.text
  }
  return (
    <text fg={fg()}>
      {icon()} {props.content}
    </text>
  )
}

// Web search provider label
function webSearchProviderLabel(provider: unknown): string {
  if (!provider) return ""
  if (typeof provider === "string") return provider
  if (typeof provider === "object" && provider !== null) {
    const p = provider as Record<string, string>
    return p.name || p.id || ""
  }
  return ""
}

interface SimpleToolProps {
  part: Part & { type: "tool" }
}

export function SimpleTool(props: SimpleToolProps) {
  const { theme, syntax } = useTheme()
  const ctx = useSession()
  const pathFormatter = usePathFormatter()
  const sync = useSync()
  const tool = () => props.part
  const state = () => tool().state
  const input = () => (tool().state.input as Record<string, any>) || {}
  const metadata = () => {
    const current = state()
    return ("metadata" in current ? (current.metadata as Record<string, any>) : {}) || {}
  }
  const output = () => {
    const current = state()
    const raw = "output" in current ? current.output || "" : ""
    if (!raw) return ""
    return stripAnsi(raw).replace(/^[\n\r]+|[\n\r]+$/g, "").replace(/\n{2,}/g, "\n")
  }
  const status = () => state().status
  const error = () => {
    const current = state()
    return current.status === "error" && "error" in current ? current.error : undefined
  }

  // Detect filetype from path
  const ft = createMemo(() => {
    const fp = input().filePath
    if (fp) return filetype(fp)
    return ""
  })

  // Diff view mode
  const view = createMemo(() => {
    const diffStyle = ctx.tui.diff_style
    if (diffStyle === "stacked") return "unified"
    return ctx.width > 120 ? "split" : "unified"
  })

  // Task specific data
  const taskMessages = createMemo(() => {
    if (tool().tool !== "task") return []
    const sessionId = metadata().sessionId
    if (!sessionId) return []
    return sync.data.message[sessionId] ?? []
  })

  const taskTools = createMemo(() => {
    return taskMessages().flatMap((msg) =>
      (sync.data.part[msg.id] ?? [])
        .filter((part): part is Part & { type: "tool" } => part.type === "tool")
        .map((part) => ({ tool: part.tool, state: part.state })),
    )
  })

  const taskCurrent = createMemo(() =>
    taskTools().findLast((x) => 
      (x.state.status === "running" || x.state.status === "completed") && "title" in x.state && x.state.title
    ),
  )

  const taskCurrentTitle = () => {
    const current = taskCurrent()
    if (!current) return ""
    return "title" in current.state ? current.state.title || "" : ""
  }

  const taskDuration = createMemo(() => {
    const first = taskMessages().find((x) => x.role === "user")?.time.created
    const assistant = taskMessages().findLast((x) => x.role === "assistant")?.time.completed
    if (!first || !assistant) return 0
    return assistant - first
  })

  return (
    <Switch>
      {/* Bash/Shell */}
      <Match when={tool().tool === "bash" || tool().tool === "shell"}>
        <ToolBlock>
          <ToolHeader icon="$" label={input().command || "Shell"} />
          <Show when={output()}>
            <OutputPreview text={output()} maxLines={10} />
          </Show>
          <Show when={error()}>
            <DetailLine tone="error">{error()}</DetailLine>
          </Show>
        </ToolBlock>
      </Match>

      {/* Write with diagnostics */}
      <Match when={(tool().tool === "write" || tool().tool === "editor_write") && metadata().diagnostics !== undefined}>
        <ToolBlock>
          <ToolHeader
            icon="✎"
            label={tool().tool === "write" ? "Wrote" : "Write"}
            value={pathFormatter.format(input().filePath)}
          />
          <box paddingLeft={2}>
            <code
              filetype={ft()}
              syntaxStyle={syntax()}
              content={input().content || output()}
              fg={theme.textMuted}
              drawUnstyledText={false}
            />
          </box>
          <Diagnostics diagnostics={metadata().diagnostics || []} filePath={input().filePath || ""} />
        </ToolBlock>
      </Match>

      {/* Write without diagnostics */}
      <Match when={tool().tool === "write" || tool().tool === "editor_write"}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Write" value={pathFormatter.format(input().filePath)} />
        </ToolBlock>
      </Match>

      {/* Edit with diff */}
      <Match when={tool().tool === "edit" && metadata().diff !== undefined}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Edit" value={pathFormatter.format(input().filePath)} />
          <diff
            diff={metadata().diff}
            view={view()}
            filetype={ft()}
            syntaxStyle={syntax()}
            showLineNumbers={true}
            width="100%"
            wrapMode={ctx.diffWrapMode()}
            fg={theme.textMuted}
            addedBg={theme.diffAddedBg}
            removedBg={theme.diffRemovedBg}
            contextBg={theme.diffContextBg}
            addedSignColor={theme.diffHighlightAdded}
            removedSignColor={theme.diffHighlightRemoved}
            lineNumberFg={theme.diffLineNumber}
            lineNumberBg={theme.diffContextBg}
            addedLineNumberBg={theme.diffAddedLineNumberBg}
            removedLineNumberBg={theme.diffRemovedLineNumberBg}
          />
        </ToolBlock>
      </Match>

      {/* Edit without diff */}
      <Match when={tool().tool === "edit"}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Edit" value={pathFormatter.format(input().filePath)} />
        </ToolBlock>
      </Match>

      {/* Read */}
      <Match when={tool().tool === "read"}>
        <ToolBlock>
          <ToolHeader icon="→" label="Read" value={pathFormatter.format(input().filePath)} />
          <Show when={metadata().loaded?.length > 0}>
            <For each={(metadata().loaded ?? []).slice(0, 5)}>
              {(filepath: string) => (
                <DetailLine>Loaded {pathFormatter.format(filepath)}</DetailLine>
              )}
            </For>
            <Show when={(metadata().loaded ?? []).length > 5}>
              <DetailLine>... {(metadata().loaded ?? []).length - 5} more files</DetailLine>
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
      <Match when={tool().tool === "glob"}>
        <ToolBlock>
          <ToolHeader icon="✱" label="Glob" value={`"${input().pattern}"`} />
          <Show when={metadata().count}>
            <DetailLine>Found {formatCount(metadata().count, "match", "matches")}</DetailLine>
          </Show>
          <Show when={input().path}>
            <DetailLine>{pathFormatter.format(input().path)}</DetailLine>
          </Show>
          <Show when={output() && status() === "completed"}>
            <OutputPreview text={output()} maxLines={5} />
          </Show>
        </ToolBlock>
      </Match>

      {/* Grep */}
      <Match when={tool().tool === "grep"}>
        <ToolBlock>
          <ToolHeader icon="✱" label="Grep" value={`"${input().pattern}"`} />
          <Show when={metadata().matches}>
            <DetailLine>Found {formatCount(metadata().matches, "match", "matches")}</DetailLine>
          </Show>
          <Show when={input().path}>
            <DetailLine>{pathFormatter.format(input().path)}</DetailLine>
          </Show>
          <Show when={output() && status() === "completed"}>
            <OutputPreview text={output()} maxLines={5} />
          </Show>
        </ToolBlock>
      </Match>

      {/* WebFetch */}
      <Match when={tool().tool === "webfetch"}>
        <ToolBlock>
          <ToolHeader icon="⬇" label="WebFetch" value={input().url} />
          <Show when={output()}>
            <OutputPreview text={output()} maxLines={6} />
          </Show>
        </ToolBlock>
      </Match>

      {/* WebSearch */}
      <Match when={tool().tool === "websearch"}>
        <ToolBlock>
          <ToolHeader icon="◈" label="WebSearch" value={`"${input().query}"`} />
          <Show when={metadata().numResults}>
            <DetailLine>{formatCount(metadata().numResults, "result")}</DetailLine>
          </Show>
        </ToolBlock>
      </Match>

      {/* Task (Subagent) */}
      <Match when={tool().tool === "task"}>
        <ToolBlock>
          <ToolHeader icon="⚙" label={`${Locale.titlecase(input().subagent_type ?? "General")} Task`} value={input().description} />
          <Show when={metadata().background === true}>
            <DetailLine>background</DetailLine>
          </Show>
          <Show when={status() === "running" && taskTools().length > 0}>
            <DetailLine>
              → {taskCurrent() 
                ? `${Locale.titlecase(taskCurrent()!.tool)} ${taskCurrentTitle()}`
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
      <Match when={tool().tool === "apply_patch" && metadata().files?.length > 0}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Apply Patch" />
          <For each={metadata().files}>
            {(file: { path: string; diff?: string }) => (
              <box flexDirection="column" gap={1}>
                <text fg={theme.primary}>{file.path}</text>
                <Show when={file.diff}>
                  <diff
                    diff={file.diff}
                    view={view()}
                    filetype={filetype(file.path)}
                    syntaxStyle={syntax()}
                    showLineNumbers={true}
                    width="100%"
                    wrapMode={ctx.diffWrapMode()}
                    fg={theme.textMuted}
                    addedBg={theme.diffAddedBg}
                    removedBg={theme.diffRemovedBg}
                    contextBg={theme.diffContextBg}
                    addedSignColor={theme.diffHighlightAdded}
                    removedSignColor={theme.diffHighlightRemoved}
                    lineNumberFg={theme.diffLineNumber}
                    lineNumberBg={theme.diffContextBg}
                    addedLineNumberBg={theme.diffAddedLineNumberBg}
                    removedLineNumberBg={theme.diffRemovedLineNumberBg}
                  />
                </Show>
              </box>
            )}
          </For>
        </ToolBlock>
      </Match>

      <Match when={tool().tool === "apply_patch"}>
        <ToolBlock>
          <ToolHeader icon="✎" label="Apply Patch" />
        </ToolBlock>
      </Match>

      {/* TodoWrite */}
      <Match when={tool().tool === "todowrite" && metadata().todos?.length > 0}>
        <ToolBlock>
          <ToolHeader icon="☐" label="Todos" />
          <For each={metadata().todos}>
            {(todo: { status: string; content: string }) => (
              <TodoItem status={todo.status} content={todo.content} />
            )}
          </For>
        </ToolBlock>
      </Match>

      <Match when={tool().tool === "todowrite"}>
        <ToolBlock>
          <ToolHeader icon="☐" label="Updating todos..." />
        </ToolBlock>
      </Match>

      {/* Question */}
      <Match when={tool().tool === "question" && metadata().answers}>
        <ToolBlock>
          <ToolHeader icon="?" label="Questions" />
          <For each={input().questions}>
            {(q: { question: string }, i: () => number) => (
              <box flexDirection="column">
                <DetailLine>Q: {q.question}</DetailLine>
                <DetailLine tone="primary">A: {metadata().answers?.[i()]?.join(", ") || "(no answer)"}</DetailLine>
              </box>
            )}
          </For>
        </ToolBlock>
      </Match>

      <Match when={tool().tool === "question"}>
        <ToolBlock>
          <ToolHeader icon="?" label={`Asked ${input().questions?.length || 0} question${input().questions?.length !== 1 ? "s" : ""}`} />
        </ToolBlock>
      </Match>

      {/* Skill */}
      <Match when={tool().tool === "skill"}>
        <ToolBlock>
          <ToolHeader icon="⚡" label="Skill" value={input().name} />
        </ToolBlock>
      </Match>

      {/* Generic tool fallback */}
      <Match when={true}>
        <ToolBlock>
          <ToolHeader icon="⚙" label={tool().tool} />
          <Show when={input().command || input().filePath || input().pattern || input().description}>
            <DetailLine>{input().command || input().filePath || input().pattern || input().description}</DetailLine>
          </Show>
          <Show when={output()}>
            <OutputPreview text={output()} maxLines={6} />
          </Show>
          <Show when={error()}>
            <DetailLine tone="error">{error()}</DetailLine>
          </Show>
        </ToolBlock>
      </Match>
    </Switch>
  )
}
