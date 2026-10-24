/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi, TuiPluginModule, TuiSlotPlugin, KeyEvent } from "@opencode-ai/plugin/tui"
import { setVimApi, VimPromptSlot, VimHomePromptSlot } from "./prompt-slot"
import { StatusBar, RecentSessions } from "./status-bar"
import { openLeaderMenu } from "./leader-menu-ui"
import {
  getNormal,
  setNormal,
  setLeader,
  getActivePromptRef,
} from "./state"

let modePopper: (() => void) | undefined
let pendingG = false

function enterNormal(api: TuiPluginApi) {
  if (getNormal(api.keymap)) return
  setNormal(api.keymap, true)
  try {
    getActivePromptRef()?.blur()
  } catch {
    /* ignore */
  }
  modePopper = api.mode.push("vim-normal")
}

function enterInsert(api: TuiPluginApi) {
  setNormal(api.keymap, false)
  setLeader(api.keymap, false)
  if (modePopper) {
    modePopper()
    modePopper = undefined
  }
  try {
    getActivePromptRef()?.focus()
  } catch {
    /* ignore */
  }
}

function handleNormalKey(api: TuiPluginApi, ctx: { event: KeyEvent }) {
  const ev = ctx.event
  const name = ev.name

  if (pendingG) {
    pendingG = false
    if (name === "g") api.keymap.dispatchCommand("session.first")
    return
  }

  // ctrl combos (ev.name is the base key, ev.ctrl true)
  if (ev.ctrl) {
    switch (name) {
      case "f":
        api.keymap.dispatchCommand("session.page.down")
        return
      case "b":
        api.keymap.dispatchCommand("session.page.up")
        return
      case "d":
        api.keymap.dispatchCommand("session.half.page.down")
        return
      case "u":
        api.keymap.dispatchCommand("session.half.page.up")
        return
      default:
        return
    }
  }

  switch (name) {
    case "i":
    case "a":
    case "I":
    case "A":
    case "o":
    case "O":
      enterInsert(api)
      return
    case "j":
    case "down":
      api.keymap.dispatchCommand("session.line.down")
      return
    case "k":
    case "up":
      api.keymap.dispatchCommand("session.line.up")
      return
    case "g":
      pendingG = true
      return
    case "G":
      api.keymap.dispatchCommand("session.last")
      return
    case "space":
      openLeaderMenu(api)
      return
    case ":":
      api.keymap.dispatchCommand("command.palette.show")
      return
    case "escape":
      return
    default:
      return
  }
}

const tui: TuiPlugin = async (api, options, meta) => {
  if (options?.enabled === false) return

  setVimApi(api)

  await api.theme.install("./oceanblack.json")
  api.theme.set("oceanblack")

  const sessionPromptSlot: TuiSlotPlugin = {
    slots: {
      session_prompt(_ctx, props) {
        return <VimPromptSlot {...(props as any)} />
      },
    },
  }
  const homePromptSlot: TuiSlotPlugin = {
    slots: {
      home_prompt(_ctx, props) {
        return <VimHomePromptSlot {...(props as any)} />
      },
    },
  }
  const footerSlot: TuiSlotPlugin = {
    slots: {
      home_footer() {
        return <StatusBar api={api} />
      },
    },
  }
  const bottomSlot: TuiSlotPlugin = {
    slots: {
      home_bottom() {
        return <RecentSessions api={api} />
      },
    },
  }

  api.slots.register(sessionPromptSlot)
  api.slots.register(homePromptSlot)
  api.slots.register(footerSlot)
  api.slots.register(bottomSlot)

  api.keymap.intercept("key", (ctx) => {
    if (api.ui.dialog.open) return
    const ev = ctx.event

    if (!getNormal(api.keymap)) {
      if (ev.name === "escape") {
        ctx.consume()
        enterNormal(api)
      }
      return
    }

    // keep global ctrl/meta shortcuts (ctrl+c, ctrl+l, ...) available in normal mode
    if (ev.ctrl || ev.meta) return

    ctx.consume()
    handleNormalKey(api, ctx)
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-vim",
  tui,
}

export default plugin
