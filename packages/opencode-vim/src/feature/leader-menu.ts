export type LeaderAction = "command" | "quit"

export type LeaderLeaf = {
  key: string
  label: string
  icon?: string
  action?: LeaderAction
  command?: string
  args?: string[]
  skill?: string
}

export type LeaderSeparator = { key: "—" | "---"; label: string; separator: true }

export type LeaderGroup = {
  key: string
  label: string
  icon?: string
  items: (LeaderLeaf | LeaderSeparator)[]
}

export type LeaderItem = LeaderLeaf | LeaderSeparator | LeaderGroup

export function isSeparator(item: LeaderItem): item is LeaderSeparator {
  return "separator" in item && item.separator === true
}

export const DEFAULT_LEADER_MENU: LeaderGroup[] = [
  {
    key: " ",
    label: "quick",
    icon: "\u{f0635}",
    items: [
      { key: " ", label: "switch model", icon: "\u{f0b7b}", action: "command", command: "model.list" },
      { key: "p", label: "command palette", icon: "\u{f002}", action: "command", command: "command.palette.show" },
    ],
  },
  {
    key: "a",
    label: "agent",
    icon: "\u{f06a9}",
    items: [
      { key: "a", label: "agents", icon: "\u{f06a9}", action: "command", command: "agent.list" },
      { key: "n", label: "next agent", icon: "\u{f04ad}", action: "command", command: "agent.cycle" },
      { key: "p", label: "prev agent", icon: "\u{f04ae}", action: "command", command: "agent.cycle.reverse" },
    ],
  },
  {
    key: "m",
    label: "model",
    icon: "\u{f0b7b}",
    items: [
      { key: "m", label: "models", icon: "\u{f0b7b}", action: "command", command: "model.list" },
      { key: "v", label: "variants", icon: "\u{f0453}", action: "command", command: "variant.list" },
      { key: "—", label: "", separator: true },
      { key: "c", label: "connect provider", icon: "\u{f0279}", action: "command", command: "provider.connect" },
    ],
  },
  {
    key: "s",
    label: "session",
    icon: "\u{f018d}",
    items: [
      { key: "n", label: "new session", icon: "\u{f0752}", action: "command", command: "session.new" },
      { key: "l", label: "session list", icon: "\u{f021e}", action: "command", command: "session.list" },
      { key: "f", label: "fork session", icon: "\u{f02d9}", action: "command", command: "session.fork" },
      { key: "—", label: "", separator: true },
      { key: "s", label: "share session", icon: "\u{f0517}", action: "command", command: "session.share" },
      { key: "r", label: "rename session", icon: "\u{f04d4}", action: "command", command: "session.rename" },
      { key: "j", label: "jump to message", icon: "\u{f0259}", action: "command", command: "session.timeline" },
      { key: "—", label: "", separator: true },
      { key: "c", label: "compact session", icon: "\u{f00e2}", action: "command", command: "session.compact" },
      { key: "i", label: "interrupt", icon: "\u{f066d}", action: "command", command: "session.interrupt" },
    ],
  },
  {
    key: "g",
    label: "git",
    icon: "\u{f02a2}",
    items: [
      { key: "d", label: "diff viewer", icon: "\u{f0209}", action: "command", command: "diff.open" },
    ],
  },
  {
    key: "w",
    label: "workspace",
    icon: "\u{f0685}",
    items: [
      { key: "w", label: "workspaces", icon: "\u{f0685}", action: "command", command: "workspace.list" },
      { key: "s", label: "set workspace", icon: "\u{f01a8}", action: "command", command: "workspace.set" },
    ],
  },
  {
    key: "u",
    label: "ui",
    icon: "\u{f0675}",
    items: [
      { key: "t", label: "theme", icon: "\u{f050e}", action: "command", command: "theme.switch" },
      { key: "m", label: "toggle dark/light", icon: "\u{f050e}", action: "command", command: "theme.switch_mode" },
      { key: "l", label: "lock theme mode", icon: "\u{f02c3}", action: "command", command: "theme.mode.lock" },
      { key: "—", label: "", separator: true },
      { key: "r", label: "thinking mode", icon: "\u{f204}", action: "command", command: "session.toggle.thinking" },
      { key: "s", label: "toggle sidebar", icon: "\u{f0675}", action: "command", command: "session.sidebar.toggle" },
      { key: "—", label: "", separator: true },
      { key: "a", label: "toggle animations", icon: "\u{f0130}", action: "command", command: "app.toggle.animations" },
      { key: "f", label: "toggle file context", icon: "\u{f0208}", action: "command", command: "app.toggle.file_context" },
      { key: "d", label: "toggle diff wrap", icon: "\u{f0216}", action: "command", command: "app.toggle.diffwrap" },
      { key: "p", label: "toggle paste summary", icon: "\u{f020f}", action: "command", command: "app.toggle.paste_summary" },
    ],
  },
  {
    key: "p",
    label: "prompt",
    icon: "\u{f03f2}",
    items: [
      { key: "s", label: "skills", icon: "\u{f04f1}", action: "command", command: "prompt.skills" },
      { key: "—", label: "", separator: true },
      { key: "x", label: "stash prompt", icon: "\u{f0042}", action: "command", command: "prompt.stash" },
      { key: "p", label: "stash pop", icon: "\u{f0043}", action: "command", command: "prompt.stash.pop" },
      { key: "l", label: "stash list", icon: "\u{f0044}", action: "command", command: "prompt.stash.list" },
    ],
  },
  {
    key: "x",
    label: "system",
    icon: "\u{f0208}",
    items: [
      { key: "s", label: "status", icon: "\u{f0208}", action: "command", command: "opencode.status" },
      { key: "h", label: "help", icon: "\u{f02d6}", action: "command", command: "help.show" },
      { key: "d", label: "open docs", icon: "\u{f0219}", action: "command", command: "docs.open" },
      { key: "o", label: "settings", icon: "\u{f0133}", action: "command", command: "opencode.settings" },
    ],
  },
  {
    key: "q",
    label: "quit",
    icon: "\u{f05fc}",
    items: [
      { key: "q", label: "quit", icon: "\u{f05fc}", action: "quit", command: "app.exit" },
    ],
  },
]

export function getLeaderMenu(_projectDir?: string): LeaderGroup[] {
  return DEFAULT_LEADER_MENU
}

export function useLeaderMenu(): LeaderGroup[] {
  return DEFAULT_LEADER_MENU
}
