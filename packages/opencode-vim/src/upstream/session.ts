// Keep all upstream session-route internals behind one fork adapter.
// If upstream refactors these symbols, this file is the first sync checkpoint.
import { useContext } from "solid-js"
import { SessionContext } from "@/context/session-context"

export { SessionContext }
export type { SessionContextValue } from "@/context/session-context"

export const sessionBindingCommands = [
  "session.share",
  "session.rename",
  "session.timeline",
  "session.fork",
  "session.compact",
  "session.unshare",
  "session.undo",
  "session.redo",
  "session.sidebar.toggle",
  "session.toggle.conceal",
  "session.toggle.timestamps",
  "session.toggle.thinking",
  "session.toggle.actions",
  "session.toggle.scrollbar",
  "session.toggle.generic_tool_output",
  "session.first",
  "session.last",
  "session.messages_last_user",
  "session.message.next",
  "session.message.previous",
  "messages.copy",
  "session.copy",
  "session.export",
  "session.child.first",
  "session.parent",
  "session.child.next",
  "session.child.previous",
] as const

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error("useContext must be used within a Session component")
  return ctx
}

export { DialogMessage } from "@tui/routes/session/dialog-message"
export { PermissionPrompt } from "@tui/routes/session/permission"
export { QuestionPrompt } from "@tui/routes/session/question"
export { SubagentFooter } from "@tui/routes/session/subagent-footer"
