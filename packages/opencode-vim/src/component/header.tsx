import { Show } from "solid-js"
import { useLocation } from "@tui/context/location"
import { useLocal } from "@tui/context/local"
import { useRoute } from "@tui/context/route"
import { useData } from "@tui/context/data"
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
  const location = useLocation()
  const route = useRoute()
  const data = useData()
  const { theme } = useForkTheme()
  const model = activeModelLabel()
  const sessionLabel = () => {
    if (route.data.type !== "session") return "new"
    return data.session.get(route.data.sessionID)?.id ?? route.data.sessionID
  }

  return (
    <box flexDirection="column" gap={0} flexShrink={0}>
      <text fg={theme.text.action.primary.base}>opencode-vim</text>
      <Show when={props.showSession ?? true}>
        <text>
          <span style={{ fg: theme.text.muted }}>Session:</span> <span style={{ fg: theme.text.base }}>{sessionLabel()}</span>
        </text>
      </Show>
      <text>
        <span style={{ fg: theme.text.muted }}>Model:</span> <span style={{ fg: theme.text.base }}>{model()}</span>
      </text>
      <text>
        <span style={{ fg: theme.text.muted }}>Context:</span> <span style={{ fg: theme.text.base }}>{location.ref?.directory ?? ""}</span>
      </text>
    </box>
  )
}
