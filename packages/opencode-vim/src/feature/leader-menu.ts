import { createMemo } from "solid-js"
import { useDirectory } from "@tui/context/directory"
import {
  loadLeaderMenuConfig,
  binaryExists,
  type LeaderGroupConfig,
  type LeaderItemConfig,
  type LeaderAction,
} from "@/config/leader-menu"

export type { LeaderGroupConfig, LeaderItemConfig, LeaderAction }

export type LeaderGroup = {
  key: string
  label: string
  icon?: string
  items: (LeaderLeaf | LeaderSeparator)[]
}

export type LeaderLeaf = {
  key: string
  label: string
  icon?: string
  action: LeaderAction
  command?: string
  args?: string[]
  require?: string
  skill?: string
}

export type LeaderSeparator = { key: "—" | "---"; label: string; separator: true }

export function isSeparator(item: LeaderLeaf | LeaderSeparator): item is LeaderSeparator {
  return "separator" in item && item.separator === true
}

function isLeaderGroupEntry(entry: LeaderGroupConfig): entry is LeaderGroupConfig {
  return "items" in entry
}

function convertToLeaderGroup(config: LeaderGroupConfig): LeaderGroup {
  return {
    key: config.key,
    label: config.label,
    icon: config.icon,
    items: config.items
      .map((item) => {
        if ("separator" in item && item.separator) {
          return { key: item.key as "—" | "---", label: item.label, separator: true as const }
        }
        const leaf = item as Extract<LeaderItemConfig, { action: LeaderAction }>
        return {
          key: leaf.key,
          label: leaf.label,
          icon: leaf.icon,
          action: leaf.action,
          command: leaf.command,
          args: leaf.args,
          require: leaf.require,
          skill: leaf.skill,
        }
      })
      .filter((item) => {
        if (isSeparator(item)) return true
        return !item.require || binaryExists(item.require)
      }),
  }
}

export const DEFAULT_LEADER_MENU: LeaderGroup[] = [
  {
    key: " ",
    label: "quick",
    icon: "\u{f0635}",
    items: [
      { key: " ", label: "model", icon: "\u{f0b7b}", action: "command", command: "model.list" },
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
      { key: "t", label: "test api", icon: "\u{f0132}", action: "api_test" },
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
      { key: "—", label: "", separator: true },
      { key: "a", label: "auto resume last", icon: "\u{f205}", action: "command", command: "vim.toggle.autoResume" },
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
      { key: "h", label: "toggle hide prompt", icon: "\u{f204}", action: "command", command: "vim.toggle.hidePrompt" },
      { key: "—", label: "", separator: true },
      { key: "a", label: "toggle animations", icon: "\u{f0130}", action: "command", command: "app.toggle.animations" },
      { key: "f", label: "toggle file context", icon: "\u{f0208}", action: "command", command: "app.toggle.file_context" },
      { key: "d", label: "toggle diff wrap", icon: "\u{f0216}", action: "command", command: "app.toggle.diffwrap" },
      { key: "p", label: "toggle paste summary", icon: "\u{f020f}", action: "command", command: "app.toggle.paste_summary" },
      { key: "—", label: "", separator: true },
      { key: "u", label: "pure mode", icon: "\u{f0675}", action: "command", command: "vim.toggle.pureMode" },
      { key: "o", label: "hide tools", icon: "\u{f0675}", action: "command", command: "vim.toggle.hideTools" },
      { key: "—", label: "", separator: true },
      { key: "c", label: "clear", icon: "\u{f00e2}", action: "clear" },
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
      { key: "—", label: "", separator: true },
      { key: "b", label: "backup config", icon: "\u{f006f}", action: "backup" },
      { key: "e", label: "restore config", icon: "\u{f006f}", action: "restore" },
    ],
  },
  {
    key: "q",
    label: "quit",
    icon: "\u{f05fc}",
    items: [
      { key: "q", label: "quit", icon: "\u{f05fc}", action: "quit" },
    ],
  },
]

function cleanupSeparators(items: (LeaderLeaf | LeaderSeparator)[]): (LeaderLeaf | LeaderSeparator)[] {
  const result: (LeaderLeaf | LeaderSeparator)[] = []
  for (const item of items) {
    if (isSeparator(item)) {
      if (result.length > 0 && !isSeparator(result[result.length - 1])) {
        result.push(item)
      }
    } else {
      result.push(item)
    }
  }
  if (result.length > 0 && isSeparator(result[result.length - 1])) {
    result.pop()
  }
  return result
}

export function getLeaderMenu(projectDir: string): LeaderGroup[] {
  let cleanDir = projectDir
  const colonIndex = cleanDir.lastIndexOf(":")
  if (colonIndex > 1) {
    cleanDir = cleanDir.slice(0, colonIndex)
  }
  if (cleanDir.startsWith("~")) {
    const homedir = process.env.HOME || process.env.USERPROFILE || ""
    cleanDir = cleanDir.replace("~", homedir)
  }

  const config = loadLeaderMenuConfig(cleanDir)
  if (!config) return DEFAULT_LEADER_MENU

  const customGroups = config.map(convertToLeaderGroup)
  const mergedGroups: LeaderGroup[] = []
  const processedDefaultKeys = new Set<string>()

  // Process custom groups to preserve user-defined order
  for (const customGroup of customGroups) {
    const defaultGroup = DEFAULT_LEADER_MENU.find((g) => g.key === customGroup.key)
    if (defaultGroup) {
      processedDefaultKeys.add(customGroup.key)

      const customItems = customGroup.items
      const defaultItems = defaultGroup.items

      // Collect all custom keys to deduplicate
      const customKeys = new Set(
        customItems.filter((item): item is LeaderLeaf => !isSeparator(item)).map((item) => item.key)
      )

      // Filter default items: exclude overrides by key
      const filteredDefaultItems = defaultItems.filter(
        (item) => isSeparator(item) || !customKeys.has(item.key)
      )

      let mergedItems: (LeaderLeaf | LeaderSeparator)[] = []
      if (customItems.length > 0 && filteredDefaultItems.length > 0) {
        mergedItems = [
          ...customItems,
          { key: "—", label: "", separator: true as const },
          ...filteredDefaultItems,
        ]
      } else if (customItems.length > 0) {
        mergedItems = [...customItems]
      } else {
        mergedItems = [...filteredDefaultItems]
      }

      mergedGroups.push({
        key: customGroup.key,
        label: customGroup.label || defaultGroup.label,
        icon: customGroup.icon || defaultGroup.icon,
        items: cleanupSeparators(mergedItems),
      })
    } else {
      // Entirely custom group
      mergedGroups.push(customGroup)
    }
  }

  // Append remaining default groups
  for (const defaultGroup of DEFAULT_LEADER_MENU) {
    if (!processedDefaultKeys.has(defaultGroup.key)) {
      mergedGroups.push(defaultGroup)
    }
  }

  return mergedGroups
}

export function useLeaderMenu(): LeaderGroup[] {
  const directory = useDirectory()
  return createMemo(() => getLeaderMenu(directory()))()
}
