import { createEffect, createMemo, For, Show } from "solid-js"
import { useSync } from "@tui/context/sync"
import { useRoute } from "@tui/context/route"
import { useForkTheme, selectedForeground } from "@/util/theme"
import { Locale } from "@/util/locale"

type SessionSummary = {
  id: string
  title?: string
  time?: {
    updated: number
  }
}

export function RecentSessions(props: {
  visible: boolean
  selectedIndex: number
  onSessionsChange?: (sessionIDs: string[]) => void
}) {
  const sync = useSync()
  const route = useRoute()
  const { theme } = useForkTheme()

  const list = createMemo(() => {
    if (!props.visible) return [] as SessionSummary[]
    const sessions = sync.data.session as SessionSummary[] | undefined
    if (!sessions) return []
    return [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)).slice(0, 10)
  })

  createEffect(() => {
    props.onSessionsChange?.(list().map((session) => session.id))
  })

  return (
    <Show when={list().length > 0}>
      <box flexDirection="column" flexShrink={0}>
        <box height={1} />
        <text fg={theme.textMuted}>Recent Sessions:</text>
        <For each={list()}>
          {(session, index) => {
            const selected = () => props.selectedIndex === index()
            return (
              <box
                width="100%"
                backgroundColor={undefined}
                onMouseUp={() => {
                  route.navigate({ type: "session", sessionID: session.id })
                }}
              >
                <text
                  fg={selected() ? selectedForeground(theme) : theme.text}
                  flexGrow={1}
                  wrapMode="none"
                >
                  {session.time?.updated ? Locale.todayTimeOrDateTime(session.time.updated) : ""}
                  {"  "}
                  {session.title || session.id.slice(0, 8)}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </Show>
  )
}
