import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { spawnSync, execSync } from "node:child_process"

export type LeaderAction = "command" | "clear" | "quit" | "backup" | "restore" | "lazygit" | "api_test" | "skill"

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

export type LeaderGroup = {
  key: string
  label: string
  icon?: string
  items: (LeaderLeaf | LeaderSeparator)[]
}

export type LeaderItem = LeaderLeaf | LeaderSeparator

export function isSeparator(item: LeaderItem): item is LeaderSeparator {
  return "separator" in item && item.separator === true
}

function binaryExists(name: string): boolean {
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export const DEFAULT_LEADER_MENU: LeaderGroup[] = [
  {
    key: " ",
    label: "quick",
    items: [{ key: " ", label: "model", action: "command", command: "model.list" }],
  },
  {
    key: "a",
    label: "agent",
    items: [
      { key: "a", label: "agents", action: "command", command: "agent.list" },
      { key: "n", label: "next agent", action: "command", command: "agent.cycle" },
      { key: "p", label: "prev agent", action: "command", command: "agent.cycle.reverse" },
    ],
  },
  {
    key: "m",
    label: "model",
    items: [
      { key: "m", label: "models", action: "command", command: "model.list" },
      { key: "v", label: "variants", action: "command", command: "variant.list" },
      { key: "c", label: "connect provider", action: "command", command: "provider.connect" },
    ],
  },
  {
    key: "s",
    label: "session",
    items: [
      { key: "n", label: "new session", action: "command", command: "session.new" },
      { key: "l", label: "session list", action: "command", command: "session.list" },
      { key: "f", label: "fork session", action: "command", command: "session.fork" },
      { key: "s", label: "share session", action: "command", command: "session.share" },
      { key: "r", label: "rename session", action: "command", command: "session.rename" },
      { key: "c", label: "compact session", action: "command", command: "session.compact" },
      { key: "i", label: "interrupt", action: "command", command: "session.interrupt" },
    ],
  },
  {
    key: "g",
    label: "git",
    items: [{ key: "d", label: "diff viewer", action: "command", command: "diff.open" }],
  },
  {
    key: "w",
    label: "workspace",
    items: [
      { key: "w", label: "workspaces", action: "command", command: "workspace.list" },
      { key: "s", label: "set workspace", action: "command", command: "workspace.set" },
    ],
  },
  {
    key: "u",
    label: "ui",
    items: [
      { key: "t", label: "theme", action: "command", command: "theme.switch" },
      { key: "m", label: "toggle dark/light", action: "command", command: "theme.switch_mode" },
      { key: "r", label: "thinking mode", action: "command", command: "session.toggle.thinking" },
      { key: "h", label: "toggle sidebar", action: "command", command: "session.sidebar.toggle" },
      { key: "c", label: "clear", action: "clear" },
      { key: "p", label: "skills", action: "command", command: "prompt.skills" },
    ],
  },
  {
    key: "l",
    label: "lazygit",
    items: [{ key: "g", label: "lazygit", action: "lazygit" }],
  },
  {
    key: "x",
    label: "system",
    items: [
      { key: "h", label: "help", action: "command", command: "help.show" },
      { key: "d", label: "open docs", action: "command", command: "docs.open" },
      { key: "b", label: "backup config", action: "backup" },
      { key: "e", label: "restore config", action: "restore" },
    ],
  },
  {
    key: "q",
    label: "quit",
    items: [{ key: "q", label: "quit", action: "quit" }],
  },
]

function runLazyGit(api: TuiPluginApi): void {
  api.renderer.suspend()
  try {
    spawnSync("lazygit", [], { stdio: "inherit" })
  } finally {
    api.renderer.resume()
  }
}

export function executeAction(api: TuiPluginApi, item: LeaderLeaf): void {
  switch (item.action) {
    case "command":
      if (item.command) api.keymap.dispatchCommand(item.command)
      break
    case "clear":
      api.keymap.dispatchCommand("prompt.clear")
      break
    case "quit":
      api.keymap.dispatchCommand("app.quit")
      break
    case "lazygit":
      runLazyGit(api)
      break
    case "skill":
      if (item.skill) api.keymap.dispatchCommand("prompt.skills")
      break
    case "backup":
    case "restore":
    case "api_test":
      api.ui.toast({
        variant: "info",
        title: "opencode-vim",
        message: `Action "${item.action}" is handled by the vim fork only`,
      })
      break
  }
}
