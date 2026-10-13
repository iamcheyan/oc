import { createContext } from "solid-js"
import type { Provider } from "@opencode/schema"
import type { useConfig } from "@tui/config"
import type { ThinkingMode } from "@tui/context/thinking"

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
