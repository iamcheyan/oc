import { createSignal, createEffect, createMemo, type Accessor } from "solid-js"
import { useBindings } from "@opentui/keymap/solid"
import { Keymap } from "../../../tui/src/context/keymap"
import { reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { loadVimConfig } from "../config/vim"
import { useRenderer } from "@opentui/solid"
import { type ScrollBoxRenderable } from "@opentui/core"
import type { MinimalPromptRef } from "../component/prompt"
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

  const runLeaderLeaf = (entry: LeaderLeaf) => {
    closeLeaderMenu()
    queueMicrotask(() => {
      if (entry.action === "quit") {
        renderer.destroy()
        process.stdout.write("\x1b[2J\x1b[H")
        process.exit(0)
        return
      }
      if (entry.command === "model.list") {
        dialog.replace(() => <DialogForkModel />)
        return
      }
      if (entry.command) {
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

  const runLeaderLeaf = (entry: LeaderLeaf) => {
    closeLeaderMenu()
    queueMicrotask(() => {
      if (entry.action === "quit") {
        renderer.destroy()
        process.stdout.write("\x1b[2J\x1b[H")
        process.exit(0)
        return
      }
      if (entry.command === "model.list") {
        dialog.replace(() => <DialogForkModel />)
        return
      }
      if (entry.command) {
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
