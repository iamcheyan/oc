import { createContext } from "solid-js"
import type { Provider } from "@opencode-ai/sdk/v2"
import type { ThinkingMode } from "@tui/context/thinking"
import type { useSync } from "@tui/context/sync"
import type { useTuiConfig } from "@tui/config"

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
  providers: () => ReadonlyMap<string, Provider>
  sync: ReturnType<typeof useSync>
  tui: ReturnType<typeof useTuiConfig>
}

export const SessionContext = createContext<SessionContextValue>()