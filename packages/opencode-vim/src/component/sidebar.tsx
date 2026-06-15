import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { createMemo, Show } from "solid-js"
import { useForkTheme } from "@/util/theme"
import { useTuiConfig } from "@tui/config"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { usePluginRuntime } from "@tui/plugin/runtime"

import { getScrollAcceleration } from "@tui/util/scroll"
import { WorkspaceLabel } from "@tui/component/workspace-label"

export function Sidebar(props: { sessionID: string; overlay?: boolean; compact?: boolean; bare?: boolean; hideFooter?: boolean }) {
  const project = useProject()
  const sync = useSync()
  const { theme } = useForkTheme()
  const tuiConfig = useTuiConfig()
  const pluginRuntime = usePluginRuntime()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  return (
    <Show when={session()}>
      <box
        backgroundColor={props.bare ? undefined : theme.backgroundPanel}
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
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </pluginRuntime.Slot>
            <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
          </box>
        </scrollbox>

        <Show when={!props.hideFooter}>
          <box flexShrink={0} gap={1} paddingTop={1}>
            <pluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
              <text fg={theme.textMuted}>
                <span style={{ fg: theme.success }}>•</span> <b>Open</b>
                <span style={{ fg: theme.text }}>
                  <b>Code</b>
                </span>{" "}
                <span>{InstallationVersion}</span>
              </text>
            </pluginRuntime.Slot>
          </box>
        </Show>
      </box>
    </Show>
  )
}
