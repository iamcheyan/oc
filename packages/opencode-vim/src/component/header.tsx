import { Show } from "solid-js"
import { useDirectory } from "@tui/context/directory"
import { useLocal } from "@tui/context/local"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useForkTheme } from "@/util/theme"

function activeModelLabel() {
  const local = useLocal()
  return () => {
    const current = local.model.current()
    if (!current) return "not selected"
    return `${current.providerID}/${current.modelID}`
  }
}

export function MinimalHeader(props: { showSession?: boolean }) {
  const directory = useDirectory()
  const route = useRoute()
  const sync = useSync()
  const { theme } = useForkTheme()
  const model = activeModelLabel()
  const sessionLabel = () => {
    if (route.data.type !== "session") return "new"
    return sync.session.get(route.data.sessionID)?.id ?? route.data.sessionID
  }

  return (
    <box flexDirection="column" gap={0} flexShrink={0}>
      <text fg={theme.primary}>opencode-vim</text>
      <Show when={props.showSession ?? true}>
        <text>
          <span style={{ fg: theme.textMuted }}>Session:</span> <span style={{ fg: theme.text }}>{sessionLabel()}</span>
        </text>
      </Show>
      <text>
        <span style={{ fg: theme.textMuted }}>Model:</span> <span style={{ fg: theme.text }}>{model()}</span>
      </text>
      <text>
        <span style={{ fg: theme.textMuted }}>Context:</span> <span style={{ fg: theme.text }}>{directory()}</span>
      </text>
    </box>
  )
}
