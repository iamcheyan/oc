import { createMemo, Show } from "solid-js"
import { useData } from "../../../tui/src/context/data"
import { useLocation } from "../../../tui/src/context/location"
import { useForkTheme } from "../util/theme"
import { Slot } from "../../../tui/src/plugin/render"
import { getScrollAcceleration } from "../../../tui/src/util/scroll"

export function Sidebar(props: { sessionID: string; overlay?: boolean; compact?: boolean; bare?: boolean; hideFooter?: boolean }) {
  const data = useData()
  const location = useLocation()
  const { theme } = useForkTheme()
  const session = createMemo(() => data.session.get(props.sessionID))
  const scrollAcceleration = createMemo(() => getScrollAcceleration())

  return (
    <Show when={session()}>
      <box
        backgroundColor={props.bare ? undefined : theme.background.raised.base}
        width={42}
        height={props.compact ? undefined : "100%"}
        paddingTop={props.bare ? 0 : 1}
        paddingBottom={props.bare ? 0 : 1}
        paddingLeft={props.bare ? 0 : 2}
        paddingRight={props.bare ? 0 : 2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background.base,
              foregroundColor: theme.border.base,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <Slot
              path="sidebar.content"
              input={{ sessionID: props.sessionID }}
            >
              <box paddingRight={1}>
                <text fg={theme.text.base}>
                  <b>{session()!.title ?? "Untitled session"}</b>
                </text>
                <text fg={theme.text.muted}>{props.sessionID}</text>
                <Show when={location.current?.project.directory}>
                  {(directory) => <text fg={theme.text.muted}>{directory()}</text>}
                </Show>
              </box>
            </Slot>
            <Slot path="sidebar.content" input={{ sessionID: props.sessionID }} />
          </box>
        </scrollbox>

        <Show when={!props.hideFooter}>
          <box flexShrink={0} gap={1} paddingTop={1}>
            <Slot path="sidebar.footer" input={{ sessionID: props.sessionID }}>
              <text fg={theme.text.muted}>
                <span style={{ fg: theme.text.feedback.success.base }}>•</span> <b>Open</b>
                <span style={{ fg: theme.text.base }}>
                  <b>Code</b>
                </span>
              </text>
            </Slot>
          </box>
        </Show>
      </box>
    </Show>
  )
}
