import { createSignal, createEffect, createMemo, type Accessor } from "solid-js"
import { useBindings } from "@opentui/keymap/solid"
import { Keymap } from "../../../tui/src/context/keymap"
import { reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { loadVimConfig } from "../config/vim"
import { useRenderer } from "@opentui/solid"
import { type ScrollBoxRenderable } from "@opentui/core"
import type { MinimalPromptRef } from "../component/prompt"
import { existsSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import {
  type LeaderGroup,
  type LeaderLeaf,
  type LeaderSeparator,
  type LeaderAction,
  isSeparator,
  getLeaderMenu,
} from "./leader-menu"
import { DialogForkModel } from "../component/dialog-model"
import type { DialogContext } from "../../../tui/src/ui/dialog"


export type { LeaderGroup, LeaderLeaf, LeaderSeparator, LeaderAction }
export { isSeparator, getLeaderMenu }

declare global {
  var __SKILL_FILTER__: string | undefined
}

const [isNormal, setIsNormal] = createSignal(false)
const [isLeaderActive, setIsLeaderActive] = createSignal(false)
const [leaderGroup, setLeaderGroup] = createSignal<string>()
const [leaderSelectedIndex, setLeaderSelectedIndex] = createSignal(0)

export function useVimMode() {
  return {
    isNormal,
    enterNormal: () => setIsNormal(true),
    enterInsert: () => {
      setIsNormal(false)
      setIsLeaderActive(false)
      setLeaderGroup(undefined)
      setLeaderSelectedIndex(0)
    },
    isLeaderActive,
    setLeaderActive: setIsLeaderActive,
    leaderGroup,
    setLeaderGroup,
    leaderSelectedIndex,
    setLeaderSelectedIndex,
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function resolveDir(dir: string): string {
  const idx = dir.lastIndexOf(":")
  let resolved = idx > 0 ? dir.substring(0, idx) : dir
  if (resolved.startsWith("~")) {
    resolved = resolved.replace("~", os.homedir())
  }
  return resolved
}

function findLazyGitPath() {
  // 1. Try to check standard paths directly
  const commonPaths = [
    "/opt/homebrew/bin/lazygit",
    "/usr/local/bin/lazygit",
    "/usr/bin/lazygit",
    "/bin/lazygit"
  ]
  for (const p of commonPaths) {
    if (existsSync(p)) return p
  }

  // 2. Try to run "which lazygit" in path environment
  try {
    const whichRes = spawnSync("which", ["lazygit"], { encoding: "utf8" })
    if (whichRes.status === 0 && whichRes.stdout.trim()) {
      return whichRes.stdout.trim()
    }
  } catch {}

  // 3. Try to check if we can run it in a zsh login shell to find it
  try {
    const shellRes = spawnSync("zsh", ["-lic", "which lazygit"], { encoding: "utf8" })
    if (shellRes.status === 0 && shellRes.stdout.trim()) {
      return shellRes.stdout.trim()
    }
  } catch {}

  // 4. Default back to just "lazygit"
  return "lazygit"
}

function resolveSafeCwd(targetPath: string | undefined): string {
  if (!targetPath) return process.cwd()
  let resolved = targetPath.trim()
  if (!resolved) return process.cwd()
  if (resolved.startsWith("~")) {
    resolved = resolved.replace("~", os.homedir())
  }
  try {
    if (existsSync(resolved)) {
      const stat = statSync(resolved)
      if (stat.isDirectory()) {
        return resolved
      }
    }
  } catch {}
  return process.cwd()
}

export function useVimSession(
  scrollRef: Accessor<ScrollBoxRenderable | undefined>,
  promptRef: Accessor<MinimalPromptRef | undefined>,
  copyMode: {
    enter: () => void
    exit: () => void
    move: (action: "up" | "down" | "left" | "right") => void
    jump: (action: "top" | "bottom" | "high" | "middle" | "low") => void
    clamp: (delta: number) => void
    active: Accessor<boolean>
  },
  dialog: DialogContext,
  directory: Accessor<string>,
  menu: Accessor<LeaderGroup[]>,
) {
  const { isNormal, enterNormal, enterInsert, isLeaderActive, setLeaderActive, leaderGroup, setLeaderGroup, leaderSelectedIndex, setLeaderSelectedIndex } = useVimMode()
  const renderer = useRenderer()
  const keymap = Keymap.use()
  const enterFocusPrompt = () => loadVimConfig(directory()).enterFocusPrompt ?? true
  let wasNormal: boolean | undefined = undefined

  const selectableItems = createMemo(() => {
    const group = menu().find((item) => item.key === leaderGroup())
    const items = group ? group.items : menu()
    return items.filter((item) => !isSeparator(item))
  })

  const focusPrompt = (text?: string) => {
    enterInsert()
    setTimeout(() => {
      const prompt = promptRef()
      if (!prompt) return
      prompt.focus()
      if (text) prompt.insert(text)
    }, 0)
  }

  const focusPromptFromNormal = () => {
    focusPrompt()
    return true
  }

  createEffect(() => {
    const normal = isNormal()
    
    // 保存滚动位置，防止模式切换时重置
    const scroll = scrollRef()
    const savedScrollTop = scroll?.scrollTop
    
    if (normal && wasNormal !== true) {
      copyMode.enter()
      promptRef()?.blur()
    }
    if (!normal && wasNormal !== false) {
      copyMode.exit()
    }
    
    // 恢复滚动位置
    if (scroll && savedScrollTop !== undefined && scroll.scrollTop !== savedScrollTop) {
      queueMicrotask(() => {
        scroll.scrollTop = savedScrollTop
      })
    }
    
    wasNormal = normal
  })

  let gTimer: ReturnType<typeof setTimeout> | null = null

  const closeLeaderMenu = () => {
    setLeaderGroup(undefined)
    setLeaderActive(false)
    setLeaderSelectedIndex(0)
  }

  const openLeaderMenu = () => {
    setLeaderGroup(undefined)
    setLeaderActive(true)
    setLeaderSelectedIndex(0)
  }

  const runLazyGit = () => {
    try {
      renderer.suspend()
      renderer.currentRenderBuffer.clear()
      const lazygitPath = findLazyGitPath()
      const safeCwd = resolveSafeCwd(directory())
      const result = spawnSync(lazygitPath, [], {
        stdio: "inherit",
        cwd: safeCwd,
      })
      if (result.error) {
        throw result.error
      }
    } catch (e) {
      console.error("lazygit error:", errorMessage(e))
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
  }

  const runLazyVim = (rendererInstance: ReturnType<typeof useRenderer>, cwd: string) => {
    // Find available editor: nvim > vim > vi
    const editors = ["nvim", "vim", "vi"]
    let editor: string | null = null
    
    for (const ed of editors) {
      try {
        const result = spawnSync("which", [ed], { encoding: "utf-8" })
        if (result.status === 0) {
          editor = ed
          break
        }
      } catch {
        // continue to next editor
      }
    }
    
    if (!editor) {
      console.error("No editor found (tried: nvim, vim, vi)")
      return
    }
    
    try {
      rendererInstance.suspend()
      rendererInstance.currentRenderBuffer.clear()
      const result = spawnSync(editor, [], {
        stdio: "inherit",
        cwd: cwd,
      })
      if (result.error) {
        throw result.error
      }
    } catch (e) {
      // Silently ignore errors (e.g., user quit editor)
      console.error("LazyVim error:", errorMessage(e))
    } finally {
      rendererInstance.currentRenderBuffer.clear()
      rendererInstance.resume()
      rendererInstance.requestRender()
    }
  }

  const runTuiTool = (cmd: string, args: string[] = []) => {
    try {
      renderer.suspend()
      renderer.currentRenderBuffer.clear()
      const safeCwd = resolveSafeCwd(directory())
      const result = spawnSync(cmd, args, {
        stdio: "inherit",
        cwd: safeCwd,
      })
      if (result.error) {
        throw result.error
      }
    } catch (e) {
      console.error(`${cmd}: ${errorMessage(e)}`)
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
  }

  const runLeaderLeaf = (entry: LeaderLeaf) => {
    closeLeaderMenu()
    queueMicrotask(() => {
      if (entry.action === "tui" && entry.command) {
        runTuiTool(entry.command, entry.args)
        return
      }
      if (entry.action === "shell" && entry.command) {
        runTuiTool(entry.command, entry.args)
        return
      }
      if (entry.action === "quit") {
        renderer.destroy()
        process.stdout.write("\x1b[2J\x1b[H")
        process.exit(0)
        return
      }
      if (entry.action === "clear") {
        renderer.currentRenderBuffer?.clear()
        return
      }
      if (entry.action === "command" && entry.command === "model.list") {
        dialog.replace(() => <DialogForkModel />)
        return
      }
      if (entry.action === "lazygit") {
        closeLeaderMenu()
        queueMicrotask(() => {
          runLazyGit()
        })
        return
      }
      if (entry.action === "lazyvim") {
        closeLeaderMenu()
        queueMicrotask(() => {
          runLazyVim(renderer, resolveDir(directory()))
        })
        return
      }
      if (entry.action === "skill" && entry.skill) {
        closeLeaderMenu()
        queueMicrotask(() => {
          // Install skills if needed
          const skillsDir = path.join(os.homedir(), ".opencode", "skills")
          const skillPath = path.join(skillsDir, entry.skill!, "SKILL.md")
          if (!existsSync(skillPath)) {
            // Skills not installed, run install script first
            const installScript = path.join(resolveDir(directory()), "packages", "opencode-vim", "skills", "install.sh")
            if (existsSync(installScript)) {
              spawnSync("/bin/bash", [installScript], { stdio: "inherit" })
            }
          }
          // Store filter for skill dialog
          globalThis.__SKILL_FILTER__ = entry.skill
          // Trigger the skill command
          keymap.dispatch("prompt.skills")
        })
        return
      }
      if (entry.action === "command" && entry.command) {
        keymap.dispatch(entry.command)
        return
      }
      // Legacy: no action specified, treat as command
      if (!entry.action && entry.command) {
        keymap.dispatch(entry.command)
      }
    })
  }

  const handleLeaderRoot = (key: string) => {
    if (!isLeaderActive() || leaderGroup()) return false
    const entry = menu().find((item: LeaderGroup) => item.key === key)
    if (!entry) return false
    const leaves = entry.items.filter((item): item is LeaderLeaf => !isSeparator(item))
    if (leaves.length === 1) {
      runLeaderLeaf(leaves[0])
      return true
    }
    // Defer setting group so the same keypress doesn't trigger a child handler
    queueMicrotask(() => setLeaderGroup(entry.key))
    return true
  }

  const handleLeaderChild = (groupKey: string, key: string) => {
    if (!isLeaderActive() || leaderGroup() !== groupKey) return false
    const group = menu().find((item: LeaderGroup) => item.key === groupKey)
    const entry = group?.items.filter((item): item is LeaderLeaf => !isSeparator(item)).find((item) => item.key === key)
    if (!entry) return false
    runLeaderLeaf(entry)
    return true
  }

  const isVimNormalActive = () => {
    if (!isNormal()) return false
    if (!copyMode.active()) return false
    if (dialog.stack.length > 0) return false
    if (renderer.currentFocusedEditor !== null) return false
    return true
  }

  const isVimEnabled = createMemo(() => isNormal() && dialog.stack.length === 0)

  Keymap.createLayer(() => ({
    mode: "global",
    priority: 100,
    commands: [
      {
        id: "vim.session.enter.normal",
        bind: "escape,ctrl+[",
        title: "Enter Normal Mode",
        group: "Vim",
        enabled: () => !isNormal() && dialog.stack.length === 0,
        run: () => {
          enterNormal()
          promptRef()?.blur()
        },
      },
    ],
  }))

  useBindings(() => ({
    enabled: reactiveMatcherFromSignal(isVimEnabled),
    bindings: [
      ...(isLeaderActive() ? [
        {
          key: "up",
          when: () => isVimNormalActive(),
          cmd: () => {
            const items = selectableItems()
            if (items.length === 0) return true
            setLeaderSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
            return true
          },
        },
        {
          key: "down",
          when: () => isVimNormalActive(),
          cmd: () => {
            const items = selectableItems()
            if (items.length === 0) return true
            setLeaderSelectedIndex((prev) => (prev + 1) % items.length)
            return true
          },
        },
        {
          key: "enter",
          when: () => isVimNormalActive(),
          cmd: () => {
            const items = selectableItems()
            const selected = items[leaderSelectedIndex()]
            if (!selected) return true
            if ("items" in selected) {
              setLeaderGroup(selected.key)
              setLeaderSelectedIndex(0)
            } else {
              runLeaderLeaf(selected as LeaderLeaf)
            }
            return true
          },
        },
        ...menu().flatMap((group: LeaderGroup) =>
          group.items
            .filter((item): item is LeaderLeaf => !isSeparator(item))
            .map((entry) => ({
              key: entry.key,
              when: () => isVimNormalActive() && leaderGroup() === group.key,
              cmd: () => handleLeaderChild(group.key, entry.key),
            })),
        ),
        ...menu().map((entry: LeaderGroup) => ({
          key: entry.key,
          when: () => isVimNormalActive() && !leaderGroup(),
          cmd: () => handleLeaderRoot(entry.key),
        })),
      ] : []),
      {
        key: "j",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          const s = scrollRef()
          if (!s) return
          const delta = Math.floor(s.height / 2)
          s.scrollBy(delta)
          copyMode.clamp(delta)
        },
      },
      {
        key: "k",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          const s = scrollRef()
          if (!s) return
          const delta = Math.floor(s.height / 2)
          s.scrollBy(-delta)
          copyMode.clamp(-delta)
        },
      },
      {
        key: "down",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          const s = scrollRef()
          if (!s) return
          const delta = Math.floor(s.height / 2)
          s.scrollBy(delta)
          copyMode.clamp(delta)
        },
      },
      {
        key: "up",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          const s = scrollRef()
          if (!s) return
          const delta = Math.floor(s.height / 2)
          s.scrollBy(-delta)
          copyMode.clamp(-delta)
        },
      },
      {
        key: "g",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          if (handleLeaderRoot("g")) return true
          if (gTimer) {
            clearTimeout(gTimer)
            gTimer = null
            copyMode.jump("top")
          } else {
            gTimer = setTimeout(() => { gTimer = null }, 500)
          }
        },
      },
      {
        key: "shift+g",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          copyMode.jump("bottom")
        },
      },
      {
        key: "ctrl+d",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          const s = scrollRef()
          if (!s) return
          const delta = Math.floor(s.height / 2)
          s.scrollBy(delta)
          copyMode.clamp(delta)
        },
      },
      {
        key: "ctrl+u",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => {
          const s = scrollRef()
          if (!s) return
          const delta = Math.floor(s.height / 2)
          s.scrollBy(-delta)
          copyMode.clamp(-delta)
        },
      },
      {
        key: "/",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt("/"),
      },
      {
        key: ":",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(":"),
      },
      {
        key: "i",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "shift+i",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "a",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "shift+a",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "o",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "shift+o",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "return",
        when: () => isVimNormalActive() && enterFocusPrompt() && !isLeaderActive(),
        cmd: () => focusPromptFromNormal(),
      },
      {
        key: "enter",
        when: () => isVimNormalActive() && enterFocusPrompt() && !isLeaderActive(),
        cmd: () => focusPromptFromNormal(),
      },
      {
        key: "escape",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (isLeaderActive()) {
            closeLeaderMenu()
            return true
          }
          return false
        },
      },
      {
        key: "backspace",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (!isLeaderActive()) return false
          if (leaderGroup()) {
            setLeaderGroup(undefined)
            return true
          }
          closeLeaderMenu()
          return true
        },
      },
      {
        key: "space",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (isLeaderActive()) return true
          openLeaderMenu()
          return true
        },
      },
      {
        key: " ",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (isLeaderActive()) return true
          openLeaderMenu()
          return true
        },
      },
    ],
  }))
}

export function useVimHome(
  promptRef: Accessor<MinimalPromptRef | undefined>,
  dialog: DialogContext,
  directory: Accessor<string>,
  menu: Accessor<LeaderGroup[]>,
) {
  const { isNormal, enterNormal, enterInsert, isLeaderActive, setLeaderActive, leaderGroup, setLeaderGroup, leaderSelectedIndex, setLeaderSelectedIndex } = useVimMode()
  const renderer = useRenderer()
  const keymap = Keymap.use()
  const enterFocusPrompt = () => loadVimConfig(directory()).enterFocusPrompt ?? true

  const selectableItems = createMemo(() => {
    const group = menu().find((item) => item.key === leaderGroup())
    const items = group ? group.items : menu()
    return items.filter((item) => !isSeparator(item))
  })

  const focusPrompt = (text?: string) => {
    enterInsert()
    setTimeout(() => {
      const prompt = promptRef()
      if (!prompt) return
      prompt.focus()
      if (text) prompt.insert(text)
    }, 0)
  }

  const focusPromptFromNormal = () => {
    focusPrompt()
    return true
  }

  createEffect(() => {
    if (isNormal()) promptRef()?.blur()
  })

  const closeLeaderMenu = () => {
    setLeaderGroup(undefined)
    setLeaderActive(false)
    setLeaderSelectedIndex(0)
  }

  const openLeaderMenu = () => {
    setLeaderGroup(undefined)
    setLeaderActive(true)
    setLeaderSelectedIndex(0)
  }

  const runLazyGit = () => {
    try {
      renderer.suspend()
      renderer.currentRenderBuffer.clear()
      const lazygitPath = findLazyGitPath()
      const safeCwd = resolveSafeCwd(directory())
      const result = spawnSync(lazygitPath, [], {
        stdio: "inherit",
        cwd: safeCwd,
      })
      if (result.error) {
        throw result.error
      }
    } catch (e) {
      console.error("lazygit error:", errorMessage(e))
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
  }

  const runLazyVim = (rendererInstance: ReturnType<typeof useRenderer>, cwd: string) => {
    const editors = ["nvim", "vim", "vi"]
    let editor: string | null = null

    for (const ed of editors) {
      try {
        const result = spawnSync("which", [ed], { encoding: "utf-8" })
        if (result.status === 0) {
          editor = ed
          break
        }
      } catch {
        // continue to next editor
      }
    }

    if (!editor) {
      console.error("No editor found (tried: nvim, vim, vi)")
      return
    }

    try {
      rendererInstance.suspend()
      rendererInstance.currentRenderBuffer.clear()
      const result = spawnSync(editor, [], {
        stdio: "inherit",
        cwd,
      })
      if (result.error) {
        throw result.error
      }
    } catch (e) {
      console.error("LazyVim error:", errorMessage(e))
    } finally {
      rendererInstance.currentRenderBuffer.clear()
      rendererInstance.resume()
      rendererInstance.requestRender()
    }
  }

  const runTuiTool = (cmd: string, args: string[] = []) => {
    try {
      renderer.suspend()
      renderer.currentRenderBuffer.clear()
      const safeCwd = resolveSafeCwd(directory())
      const result = spawnSync(cmd, args, {
        stdio: "inherit",
        cwd: safeCwd,
      })
      if (result.error) {
        throw result.error
      }
    } catch (e) {
      console.error(`${cmd}: ${errorMessage(e)}`)
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
  }

  const runLeaderLeaf = (entry: LeaderLeaf) => {
    closeLeaderMenu()
    queueMicrotask(() => {
      if ((entry.action === "tui" || entry.action === "shell") && entry.command) {
        runTuiTool(entry.command, entry.args)
        return
      }
      if (entry.action === "quit") {
        renderer.destroy()
        process.stdout.write("\x1b[2J\x1b[H")
        process.exit(0)
        return
      }
      if (entry.action === "clear") {
        renderer.currentRenderBuffer?.clear()
        return
      }
      if ((entry.action === "command" || !entry.action) && entry.command === "model.list") {
        dialog.replace(() => <DialogForkModel />)
        return
      }
      if (entry.action === "lazygit") {
        runLazyGit()
        return
      }
      if (entry.action === "lazyvim") {
        runLazyVim(renderer, resolveDir(directory()))
        return
      }
      if ((entry.action === "command" || !entry.action) && entry.command) {
        keymap.dispatch(entry.command)
      }
    })
  }

  const handleLeaderRoot = (key: string) => {
    if (!isLeaderActive() || leaderGroup()) return false
    const entry = menu().find((item) => item.key === key)
    if (!entry) return false
    const leaves = entry.items.filter((item): item is LeaderLeaf => !isSeparator(item))
    if (leaves.length === 1) {
      runLeaderLeaf(leaves[0])
      return true
    }
    setLeaderGroup(entry.key)
    setLeaderSelectedIndex(0)
    return true
  }

  const handleLeaderChild = (groupKey: string, key: string) => {
    if (!isLeaderActive() || leaderGroup() !== groupKey) return false
    const group = menu().find((item) => item.key === groupKey)
    const entry = group?.items.filter((item): item is LeaderLeaf => !isSeparator(item)).find((item) => item.key === key)
    if (!entry) return false
    runLeaderLeaf(entry)
    return true
  }

  const isVimNormalActive = () => {
    if (!isNormal()) return false
    if (dialog.stack.length > 0) return false
    if (renderer.currentFocusedEditor !== null) return false
    return true
  }

  const isVimEnabled = createMemo(() => isNormal() && dialog.stack.length === 0)

  Keymap.createLayer(() => ({
    mode: "global",
    priority: 100,
    commands: [
      {
        id: "vim.home.enter.normal",
        bind: "escape,ctrl+[",
        title: "Enter Normal Mode",
        group: "Vim",
        enabled: () => !isNormal() && dialog.stack.length === 0,
        run: () => {
          enterNormal()
          promptRef()?.blur()
        },
      },
    ],
  }))

  useBindings(() => ({
    enabled: reactiveMatcherFromSignal(isVimEnabled),
    bindings: [
      ...(isLeaderActive() ? [
        {
          key: "up",
          when: () => isVimNormalActive(),
          cmd: () => {
            const items = selectableItems()
            if (items.length === 0) return true
            setLeaderSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
            return true
          },
        },
        {
          key: "down",
          when: () => isVimNormalActive(),
          cmd: () => {
            const items = selectableItems()
            if (items.length === 0) return true
            setLeaderSelectedIndex((prev) => (prev + 1) % items.length)
            return true
          },
        },
        {
          key: "enter",
          when: () => isVimNormalActive(),
          cmd: () => {
            const items = selectableItems()
            const selected = items[leaderSelectedIndex()]
            if (!selected) return true
            if ("items" in selected) {
              setLeaderGroup(selected.key)
              setLeaderSelectedIndex(0)
            } else {
              runLeaderLeaf(selected as LeaderLeaf)
            }
            return true
          },
        },
        ...menu().flatMap((group) =>
          group.items
            .filter((item): item is LeaderLeaf => !isSeparator(item))
            .map((entry) => ({
              key: entry.key,
              when: () => isVimNormalActive() && leaderGroup() === group.key,
              cmd: () => handleLeaderChild(group.key, entry.key),
            })),
        ),
        ...menu().map((entry) => ({
          key: entry.key,
          when: () => isVimNormalActive() && !leaderGroup(),
          cmd: () => handleLeaderRoot(entry.key),
        })),
      ] : []),
      {
        key: "/",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt("/"),
      },
      {
        key: ":",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(":"),
      },
      {
        key: "i",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "shift+i",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "a",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "shift+a",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "o",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "shift+o",
        when: () => isVimNormalActive() && !isLeaderActive(),
        cmd: () => focusPrompt(),
      },
      {
        key: "return",
        when: () => isVimNormalActive() && enterFocusPrompt() && !isLeaderActive(),
        cmd: () => focusPromptFromNormal(),
      },
      {
        key: "enter",
        when: () => isVimNormalActive() && enterFocusPrompt() && !isLeaderActive(),
        cmd: () => focusPromptFromNormal(),
      },
      {
        key: "escape",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (isLeaderActive()) {
            closeLeaderMenu()
            return true
          }
          return false
        },
      },
      {
        key: "backspace",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (!isLeaderActive()) return false
          if (leaderGroup()) {
            setLeaderGroup(undefined)
            return true
          }
          closeLeaderMenu()
          return true
        },
      },
      {
        key: "space",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (isLeaderActive()) return true
          openLeaderMenu()
          return true
        },
      },
      {
        key: " ",
        when: () => isVimNormalActive(),
        cmd: () => {
          if (isLeaderActive()) return true
          openLeaderMenu()
          return true
        },
      },
    ],
  }))

  return {}
}

export function VimModeIndicator() {
  const { isNormal } = useVimMode()
  return (
    <text>
      {isNormal() ? "NORMAL · " : "INSERT · "}
    </text>
  )
}
