import { measureEditText, type BoxRenderable, type TextareaRenderable, type ScrollBoxRenderable, type WidthMethod } from "@opentui/core"
import { pathToFileURL } from "bun"
import fuzzysort from "fuzzysort"
import path from "path"
import { firstBy } from "remeda"
import { createMemo, createResource, createEffect, onMount, onCleanup, Index, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useEditorContext } from "../../../tui/src/context/editor"
import { useClient } from "../../../tui/src/context/client"
import { useData } from "../../../tui/src/context/data"
import { useTuiPaths } from "../../../tui/src/context/runtime"
import { getScrollAcceleration } from "../../../tui/src/util/scroll"
import { useConfig } from "../../../tui/src/config/index"
import { useForkTheme, selectedForeground } from "../util/theme"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Locale } from "../util/locale"
import type { PromptInfo, PromptPartRef } from "../../../tui/src/prompt/history"
import { useFrecency } from "../../../tui/src/prompt/frecency"
import { Keymap } from "../../../tui/src/context/keymap"
import { mentionTriggerIndex } from "../../../tui/src/prompt/display"
import { useVimMode } from "../feature/vim-mode"
import { stringWidth } from "../../../tui/src/util/string-width"
import { parseFileLineRange } from "../../../tui/src/prompt/parse"
import type { FileSystemEntry } from "@opencode/client"
import type { KeymapCommand } from "@opencode/plugin/tui/context"
import { Skill } from "@opencode/schema"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function displayCharAt(value: string, offset: number, widthMethod: WidthMethod) {
  let width = 0
  for (const part of graphemes.segment(value)) {
    const next = width + measureEditText(part.segment, { widthMethod })
    if (offset < next) return part.segment
    width = next
  }
}

function removeLineRange(input: string) {
  const hashIndex = input.lastIndexOf("#")
  return hashIndex !== -1 ? input.substring(0, hashIndex) : input
}

export type AutocompleteRef = {
  onInput: (value: string) => void
  hide: () => void
  visible: false | "@" | "/" | "directory" | "reference"
  completeQueueableCommand: () => boolean
}

export type AutocompleteOption = {
  display: string
  value?: string
  aliases?: string[]
  disabled?: boolean
  description?: string
  isDirectory?: boolean
  onSelect?: () => void
  path?: string
  kind?: "skill" | "agent" | "reference"
}

export function Autocomplete(props: {
  value: string
  sessionID?: string
  argumentAutocomplete?: (command: KeymapCommand) => "directory" | undefined
  directoryOptions?: (query: string) => AutocompleteOption[]
  setPrompt: (input: (prompt: PromptInfo) => void) => void
  setExtmark: (part: PromptPartRef, extmarkId: number) => void
  anchor: () => BoxRenderable
  input: () => TextareaRenderable
  ref: (ref: AutocompleteRef) => void
  fileStyleId: number
  agentStyleId: number
  skillStyleId: number
  hasSkill: (id: string) => boolean
  promptPartTypeId: () => number
}) {
  const editor = useEditorContext()
  const client = useClient()
  const data = useData()
  const keymap = Keymap.use()
  const keymapCommands = Keymap.useCommands()
  const theme = useForkTheme().theme
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const frecency = useFrecency()
  const config = useConfig().data
  const paths = useTuiPaths()
  const vimMode = useVimMode()
  const [store, setStore] = createStore({
    index: 0,
    selected: 0,
    visible: false as AutocompleteRef["visible"],
    input: "keyboard" as "keyboard" | "mouse",
  })
  const [positionTick, setPositionTick] = createSignal(0)

  createEffect(() => {
    if (!store.visible) return
    const popMode = keymap.mode.push("autocomplete")
    onCleanup(popMode)
  })

  createEffect(() => {
    if (store.visible) {
      let lastPos = { x: 0, y: 0, width: 0 }
      const interval = setInterval(() => {
        const anchor = props.anchor()
        if (anchor.x !== lastPos.x || anchor.y !== lastPos.y || anchor.width !== lastPos.width) {
          lastPos = { x: anchor.x, y: anchor.y, width: anchor.width }
          setPositionTick((t) => t + 1)
        }
      }, 50)

      onCleanup(() => clearInterval(interval))
    }
  })

  let container: BoxRenderable | undefined

  const position = createMemo(() => {
    if (!store.visible) return { x: 0, y: 0, width: 0 }
    dimensions()
    positionTick()
    const anchor = props.anchor()
    const parent = container?.parent
    const parentX = parent?.x ?? 0
    const parentY = parent?.y ?? 0

    return {
      x: anchor.x - parentX,
      y: anchor.y - parentY,
      width: anchor.width,
    }
  })

  const filter = createMemo(() => {
    if (!store.visible) return
    props.value
    return props
      .input()
      .getTextRange(store.visible === "directory" ? store.index : store.index + 1, props.input().cursorOffset)
  })

  const [search, setSearch] = createSignal("")
  createEffect(() => {
    const next = filter()
    setSearch(next ? next : "")
  })

  function insertPart(
    text: string,
    part:
      | { type: "file"; value: NonNullable<PromptInfo["files"]>[number]; path?: string }
      | { type: "agent"; value: NonNullable<PromptInfo["agents"]>[number] }
      | { type: "skill"; value: NonNullable<PromptInfo["skills"]>[number] },
  ) {
    if (part.type === "skill" && props.hasSkill?.(part.value.id)) return
    const input = props.input()
    const currentCursorOffset = input.cursorOffset

    const charAfterCursor = displayCharAt(props.value, currentCursorOffset, renderer.widthMethod)
    const needsSpace = charAfterCursor !== " "
    const prefix = "@"
    const append = prefix + text + (needsSpace ? " " : "")

    input.cursorOffset = store.index
    const startCursor = input.logicalCursor
    input.cursorOffset = currentCursorOffset
    const endCursor = input.logicalCursor

    input.deleteRange(startCursor.row, startCursor.col, endCursor.row, endCursor.col)
    input.insertText(append)

    const virtualText = prefix + text
    const extmarkStart = store.index
    const extmarkEnd = extmarkStart + stringWidth(virtualText)

    const styleId =
      part.type === "file" ? props.fileStyleId : part.type === "skill" ? props.skillStyleId : props.agentStyleId

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId,
      typeId: props.promptPartTypeId(),
    })

    props.setPrompt((draft) => {
      if (part.type === "file") {
        const files = (draft.files ??= [])
        const existingIndex = files.findIndex((file) => file.uri === part.value.uri)
        if (existingIndex !== -1) {
          const existing = files[existingIndex]
          if (existing?.mention) {
            existing.mention.start = extmarkStart
            existing.mention.end = extmarkEnd
            existing.mention.text = virtualText
          }
          return
        }
        if (part.value.mention) {
          part.value.mention.start = extmarkStart
          part.value.mention.end = extmarkEnd
          part.value.mention.text = virtualText
        }
        const index = files.length
        files.push(part.value)
        props.setExtmark({ type: "file", index }, extmarkId)
        return
      }

      if (part.type === "skill") {
        const skills = (draft.skills ??= [])
        if (skills.some((skill) => skill.id === part.value.id)) return
        if (part.value.mention) {
          part.value.mention.start = extmarkStart
          part.value.mention.end = extmarkEnd
          part.value.mention.text = virtualText
        }
        const index = skills.length
        skills.push(part.value)
        props.setExtmark({ type: "skill", index }, extmarkId)
        return
      }

      const agents = (draft.agents ??= [])
      if (part.value.mention) {
        part.value.mention.start = extmarkStart
        part.value.mention.end = extmarkEnd
        part.value.mention.text = virtualText
      }
      const index = agents.length
      agents.push(part.value)
      props.setExtmark({ type: "agent", index }, extmarkId)
    })

    if (part.type === "file" && part.path) frecency.updateFrecency(part.path)
  }

  function createFilePart(
    item: FileSystemEntry,
    filePath: string,
    lineRange?: { startLine: number; endLine?: number },
  ) {
    const urlObj = pathToFileURL(filePath)
    const filename =
      lineRange && item.type !== "directory"
        ? `${item.path}#${lineRange.startLine}${lineRange.endLine ? `-${lineRange.endLine}` : ""}`
        : item.path

    if (lineRange && item.type !== "directory") {
      urlObj.searchParams.set("start", String(lineRange.startLine))
      if (lineRange.endLine !== undefined) {
        urlObj.searchParams.set("end", String(lineRange.endLine))
      }
    }

    return {
      filename,
      part: {
        type: "file" as const,
        path: item.path,
        value: {
          uri: urlObj.href,
          name: filename,
          mention: { start: 0, end: 0, text: "" },
        },
      },
    }
  }

  const references = createMemo(() => data.location.reference.list() ?? [])

  const referenceMatch = createMemo(() => {
    if (store.visible !== "reference") return
    const base = parseFileLineRange(search()).base
    const slash = base.indexOf("/")
    const alias = slash === -1 ? base : base.slice(0, slash)
    return references().find((item) => !item.hidden && item.name === alias)
  })

  function normalizeMentionPath(filePath: string) {
    const baseDir = data.location.info()?.directory || paths.cwd
    const absolute = path.resolve(filePath)
    const relative = path.relative(baseDir, absolute)

    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join("/")
    }

    return absolute.split(path.sep).join("/")
  }

  function insertFileMention(input: { filePath: string; lineStart: number; lineEnd: number }) {
    const item = normalizeMentionPath(input.filePath)
    const lineRange = {
      startLine: input.lineStart,
      endLine: input.lineEnd > input.lineStart ? input.lineEnd : undefined,
    }
    const { filename, part } = createFilePart({ path: item, type: "file" }, input.filePath, lineRange)
    const index = store.visible === "reference" ? store.index : props.input().cursorOffset

    setStore("visible", false)
    setStore("index", index)
    insertPart(filename, part)
  }

  function insertDirectory(directory: string) {
    const input = props.input()
    const cursorOffset = input.cursorOffset
    input.cursorOffset = store.index
    const start = input.logicalCursor
    input.cursorOffset = cursorOffset
    const end = input.logicalCursor
    input.deleteRange(start.row, start.col, end.row, end.col)
    input.insertText(directory)
  }

  const [files] = createResource(
    () => ({ query: search(), location: data.location.info(), visible: store.visible }),
    async (input, info): Promise<{ options: AutocompleteOption[]; failed: boolean; mode: AutocompleteRef["visible"]; query: string; resolved: boolean }> => {
      if (!input.visible || input.visible === "reference")
        return { options: [], failed: false, mode: input.visible, query: input.query, resolved: true }
      if (referenceMatch())
        return { options: [], failed: false, mode: input.visible, query: input.query, resolved: true }
      const { lineRange, base } = parseFileLineRange(input.query ?? "")
      const requestLocation = {
        directory: input.location?.directory,
      }
      const width = props.anchor().width - 4
      if (input.visible === "directory") {
        const result = await client.api.file
          .find({
            query: base,
            limit: 20,
            location: { directory: requestLocation.directory ?? paths.cwd },
          })
          .catch(() => undefined)
        if (!result)
          return info.value?.mode === input.visible
            ? { ...info.value, failed: true }
            : { options: [], failed: true, mode: input.visible, query: input.query, resolved: false }
        return {
          options: result.data.map((item) => ({
            display: Locale.truncateMiddle(item.path, width),
            value: item.path,
            isDirectory: item.type === "directory",
            path: item.path,
            onSelect: () => insertDirectory(item.path),
          })),
          failed: false,
          mode: input.visible,
          query: input.query,
          resolved: true,
        }
      }
      const result = await client.api.file
        .find({
          query: base,
          limit: 20,
          location: { directory: requestLocation.directory ?? paths.cwd },
        })
        .then((result) => result, () => undefined)

      if (!result)
        return info.value?.mode === input.visible
          ? { ...info.value, failed: true }
          : { options: [], failed: true, mode: input.visible, query: input.query, resolved: false }

      const options: AutocompleteOption[] = []

      options.push(
        ...result.data.map((item): AutocompleteOption => {
          const { filename, part } = createFilePart(item, path.join(result.location.directory, item.path), lineRange)
          return {
            display: Locale.truncateMiddle(filename, width),
            value: filename,
            isDirectory: item.type === "directory",
            path: item.path,
            onSelect: () => {
              insertPart(filename, part)
            },
          }
        })
      )

      return { options, failed: false, mode: input.visible, query: input.query, resolved: true }
    },
    {
      initialValue: {
        options: [],
        failed: false,
        mode: false as AutocompleteRef["visible"],
        query: "",
        resolved: false,
      },
    },
  )

  const visibleFiles = createMemo(() => {
    const value = files.loading ? files.latest : files()
    if (value?.mode === store.visible) return value
    return { options: [], failed: false, query: "", resolved: false }
  })

  const agents = createMemo(() => {
      return (data.location.agent.list() ?? [])
        .filter((agent) => !agent.hidden && agent.mode !== "primary")
        .map(
          (agent): AutocompleteOption => ({
            display: "@" + agent.id,
            kind: "agent",
            onSelect: () => {
              insertPart(agent.id, {
                type: "agent",
                value: {
                  name: agent.id,
                  mention: { start: 0, end: 0, text: "" },
                },
              })
            },
          })
        )
    })

  const skillOptions = createMemo(() =>
      (data.location.skill.list(data.location.info()) ?? []).map(
        (skill): AutocompleteOption => ({
          display: "@" + skill.id,
          description: skill.description,
          kind: "skill",
          onSelect: () => {
            insertPart(skill.id, {
              type: "skill",
              value: { id: Skill.ID.make(skill.id), mention: { start: 0, end: 0, text: "" } }
            })
          }
        })
      )
    )

  const referenceAliases = createMemo(() =>
    references()
      .filter((reference) => !reference.hidden)
      .map(
        (reference): AutocompleteOption => ({
          display: "@" + reference.name,
          kind: "reference",
          description: ` ${reference.source.type === "git" ? reference.source.repository : reference.source.path}`,
          onSelect: () => {
            insertPart(reference.name, {
              type: "file",
              path: reference.name,
              value: {
                uri: pathToFileURL(reference.path).href,
                name: reference.name,
                mention: { start: 0, end: 0, text: "" }
              }
            })
          }
        })
      )
  )

  const commands = createMemo<AutocompleteOption[]>(() => {
    const results: AutocompleteOption[] = []
    for (const command of keymapCommands()) {
      // keymapCommands() returns commands from the local keymap
      // They don't have a source property - that's from server commands
      const slash = command.slash
      if (!slash) continue
      results.push({
        display: "/" + slash.name,
        description: command.description,
        onSelect: () => {
          const newText = "/" + slash.name + " "
          const cursor = props.input().logicalCursor
          props.input().deleteRange(0, 0, cursor.row, cursor.col)
          props.input().insertText(newText)
          props.input().cursorOffset = stringWidth(newText)
        },
      })
    }

    results.sort((a, b) => a.display.localeCompare(b.display))

    const max = firstBy(results, [(item) => item.display.length, "desc"])?.display.length
    return max ? results.map((item) => ({ ...item, display: item.display.padEnd(max + 2) })) : results
  })

  const options = createMemo((previous: AutocompleteOption[] | undefined) => {
    const fileOptions = visibleFiles().options
    const match = referenceMatch()
    if (store.visible === "reference" && match) return referenceAliases().filter((item) => item.display === `@${match.name}`)
    const mixed =
      store.visible === "@"
        ? [...referenceAliases(), ...agents(), ...skillOptions(), ...fileOptions]
        : store.visible === "directory"
        ? fileOptions
        : commands()
    const query = search()
    if (!query) return mixed
    if (files.loading && previous?.length) return previous
    return fuzzysort.go(removeLineRange(query), mixed, {
      keys: [(item) => removeLineRange((item.value ?? item.display).trimEnd()), "description", (item) => item.aliases?.join(" ") ?? ""],
      limit: 100,
      scoreFn: (results) => {
        const matchResult = results[0]
        let score = results.score
        if (matchResult && matchResult.target.startsWith(store.visible + query)) score *= 2
        return score * (1 + (results.obj.path ? frecency.getFrecency(results.obj.path) : 0))
      },
    }).map((result) => result.obj)
  })

  createEffect(() => {
    filter()
    setStore("selected", 0)
  })

  function move(direction: -1 | 1) {
    if (!store.visible || !options().length) return
    let next = store.selected + direction
    if (next < 0) next = options().length - 1
    if (next >= options().length) next = 0
    moveTo(next)
  }

  function moveTo(next: number) {
    setStore("selected", next)
    if (!scroll) return
    const viewportHeight = Math.min(height(), options().length)
    const bottom = scroll.scrollTop + viewportHeight
    if (next < scroll.scrollTop) scroll.scrollBy(next - scroll.scrollTop)
    else if (next + 1 > bottom) scroll.scrollBy(next + 1 - bottom)
  }

  function select() {
    const selected = options()[store.selected]
    if (!selected) return
    hide()
    selected.onSelect?.()
  }

  function expandDirectory() {
    const selected = options()[store.selected]
    if (!selected) return
    const input = props.input()
    const cursorOffset = input.cursorOffset
    const displayText = (selected.value ?? selected.display).trimEnd()
    const value = displayText.startsWith("@") ? displayText.slice(1) : displayText
    input.cursorOffset = store.index
    const start = input.logicalCursor
    input.cursorOffset = cursorOffset
    const end = input.logicalCursor
    input.deleteRange(start.row, start.col, end.row, end.col)
    input.insertText("@" + value)
    setStore("selected", 0)
  }

  Keymap.createLayer(() => ({
    mode: "autocomplete",
    target: props.input,
    enabled: () => Boolean(store.visible),
    commands: [
      { id: "prompt.autocomplete.prev", title: "Previous autocomplete item", group: "Autocomplete", run() { setStore("input", "keyboard"); move(-1) } },
      { id: "prompt.autocomplete.next", title: "Next autocomplete item", group: "Autocomplete", run() { setStore("input", "keyboard"); move(1) } },
      { id: "prompt.autocomplete.hide", title: "Hide autocomplete", group: "Autocomplete", run() { hide(); vimMode.enterNormal() } },
      { id: "prompt.clear", title: "Dismiss autocomplete", group: "Autocomplete", run() { hide() } },
      { id: "prompt.autocomplete.select", title: "Select autocomplete item", group: "Autocomplete", run() { select() } },
      { id: "prompt.autocomplete.complete", title: "Complete autocomplete item", group: "Autocomplete", run() { if (options()[store.selected]?.isDirectory) expandDirectory(); else select() } },
    ],
  }))

  function show(mode: "@" | "/") {
    setStore({ visible: mode, index: props.input().cursorOffset })
    setPositionTick((t) => t + 1)
  }

  function hide() {
    const text = props.input().plainText
    if (store.visible === "/" && !text.endsWith(" ") && text.startsWith("/")) {
      const cursor = props.input().logicalCursor
      props.input().deleteRange(0, 0, cursor.row, cursor.col)
      props.setPrompt((draft) => { draft.text = props.input().plainText })
    }
    setStore("visible", false)
  }

  onMount(() => {
    const unsubscribe = editor.onMention(insertFileMention)
    onCleanup(unsubscribe)
    props.ref({
      get visible() { return store.visible },
      onInput(value) {
        if (store.visible) {
          if (props.input().cursorOffset <= store.index || props.input().getTextRange(store.index, props.input().cursorOffset).match(/\s/) || (store.visible === "/" && value.match(/^\S+\s+\S+\s*$/))) hide()
          return
        }
        const offset = props.input().cursorOffset
        if (offset === 0) return
        if (value.startsWith("/") && !value.slice(0, offset).match(/\s/)) { show("/"); setStore("index", 0); return }
        const index = mentionTriggerIndex(props.input().getTextRange(0, offset), renderer.widthMethod)
        if (index !== undefined) { show("@"); setStore("index", index) }
      },
      hide,
      completeQueueableCommand: () => false,
    })
  })

  const height = createMemo(() => Math.min(10, options().length || 1))
  let scroll: ScrollBoxRenderable
  const scrollAcceleration = createMemo(() => getScrollAcceleration(config))
  const menuWidth = createMemo(() => Math.max(24, Math.min(position().width, Math.max(24, dimensions().width - 2))))
  return (
    <box ref={(renderable: BoxRenderable) => (container = renderable)} visible={store.visible !== false} position="absolute" top={Math.max(0, position().y - height())} left={Math.max(0, Math.min(position().x, dimensions().width - menuWidth()))} width={menuWidth()} zIndex={100}>
      <scrollbox ref={(renderable: ScrollBoxRenderable) => (scroll = renderable)} backgroundColor={theme.background.raised.base} height={height()} scrollX={false} verticalScrollbarOptions={{ visible: true }} horizontalScrollbarOptions={{ visible: false }} scrollAcceleration={scrollAcceleration()}>
        <Index each={options()} fallback={<box paddingLeft={1} paddingRight={1}><text fg={theme.text.muted}>No matching items</text></box>}>
          {(option, index) => (
            <box paddingLeft={1} paddingRight={1} backgroundColor={index === store.selected ? theme.background.action.primary.base : undefined} flexDirection="row" onMouseMove={() => setStore("input", "mouse")} onMouseOver={() => { if (store.input === "mouse") moveTo(index) }} onMouseDown={() => { setStore("input", "mouse"); moveTo(index) }} onMouseUp={() => select()}>
              <text fg={index === store.selected ? selectedForeground(theme) : theme.text.base} flexShrink={0}>{option().display}</text>
              <Show when={option().description}><text fg={index === store.selected ? selectedForeground(theme) : theme.text.muted} wrapMode="none">{" " + option().description}</text></Show>
            </box>
          )}
        </Index>
      </scrollbox>
    </box>
  )
}
