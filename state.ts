// Shared vim-mode state stored on the host keymap's data map so that
// host-rendered components (using the host's solid instance) can read it
// reactively via useKeymapSelector. This avoids the dual-solid-instance
// problem that breaks reactivity for external plugins running against a
// compiled opencode binary.

const NORMAL = "opencode-vim.normal"
const LEADER = "opencode-vim.leader"
const LEADER_VIEW = "opencode-vim.leader.view"
const LEADER_SELECTED = "opencode-vim.leader.selected"

import type { TuiKeymap } from "@opencode-ai/plugin/tui"
import type { TuiPromptRef } from "@opencode-ai/plugin/tui"

export type Km = TuiKeymap

export const getNormal = (km: Km) => !!km.getData(NORMAL)
export const setNormal = (km: Km, v: boolean) => km.setData(NORMAL, v)
export const getLeader = (km: Km) => !!km.getData(LEADER)
export const setLeader = (km: Km, v: boolean) => km.setData(LEADER, v)
export const getLeaderView = (km: Km) => (km.getData(LEADER_VIEW) as string | undefined) ?? "groups"
export const setLeaderView = (km: Km, v: string) => km.setData(LEADER_VIEW, v)
export const getLeaderSelected = (km: Km) => (km.getData(LEADER_SELECTED) as number | undefined) ?? 0
export const setLeaderSelected = (km: Km, v: number) => km.setData(LEADER_SELECTED, v)

let activePromptRef: TuiPromptRef | undefined
export function setActivePromptRef(ref: TuiPromptRef | undefined) {
  activePromptRef = ref
}
export function getActivePromptRef(): TuiPromptRef | undefined {
  return activePromptRef
}

export type VimMode = "INSERT" | "NORMAL"