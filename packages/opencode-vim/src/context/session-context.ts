import { createContext } from "solid-js"
import type { useConfig } from "../../../tui/src/config/index"
import type { ThinkingMode } from "../../../tui/src/context/thinking"

export type SessionContextValue = {
  width: number
  sessionID: string
  conceal: () => boolean
  thinkingMode: () => ThinkingMode
  showThinking: () => boolean
  showTimestamps: () => boolean
  showDetails: () => boolean
  showGenericToolOutput: () => boolean
  diffWrapMode: () => "word" | "none"
  providers: () => ReadonlyMap<string, unknown>
  sync: unknown
  tui: unknown
  config: ReturnType<typeof useConfig>
}

export const SessionContext = createContext<SessionContextValue>()
