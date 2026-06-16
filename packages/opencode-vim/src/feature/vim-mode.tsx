import { createSignal, createEffect, createMemo, type Accessor, Show, onMount, onCleanup, For } from "solid-js"
import { useBindings, useOpencodeKeymap } from "@tui/keymap"
import { reactiveMatcherFromSignal } from "@opentui/keymap/solid"
import { useKV } from "@tui/context/kv"
import { useForkTheme } from "@/util/theme"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { TextAttributes, RGBA } from "@opentui/core"
import type { MinimalPromptRef } from "@/component/prompt"
import { useDirectory } from "@tui/context/directory"
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
} from "@/feature/leader-menu"
import { performConfigBackup, performFullBackup, performFullRestore } from "../util/backup"
import { loadConfig, getTestableProviders, testProvider, testAuth, type ProviderTestEntry, type ProviderTestResult, colors, getColumnWidthsByTerminalWidth, formatRow, type ColumnWidths } from "../util/api-test"

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

const WHITE_BOX_BORDER = {
  topLeft: "┌",
  bottomLeft: "└",
  vertical: "│",
  topRight: "┐",
  bottomRight: "┘",
  horizontal: "─",
  bottomT: "┴",
  topT: "┬",
  cross: "┼",
  leftT: "├",
  rightT: "┤",
}

export function DialogLazyGit(props: { dialog: any; error?: string }) {
  const { theme } = useForkTheme()

  onMount(() => {
    props.dialog.setSize("medium")
  })

  useBindings(() => ({
    bindings: [
      {
        key: "escape",
        desc: "Close lazygit dialog",
        group: "Dialog",
        cmd: () => {
          props.dialog.clear()
        },
      },
      {
        key: "q",
        desc: "Close lazygit dialog",
        group: "Dialog",
        cmd: () => {
          props.dialog.clear()
        },
      },
    ],
  }))

  return (
    <box
      border={["top", "bottom", "left", "right"]}
      borderColor={RGBA.fromInts(255, 255, 255, 255)}
      customBorderChars={WHITE_BOX_BORDER}
      height={props.error ? 7 : 5}
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.backgroundPanel}
      padding={1}
    >
      <text fg={RGBA.fromInts(255, 255, 255, 255)} attributes={TextAttributes.BOLD} marginBottom={props.error ? 1 : 0}>
        lazygit
      </text>
      <Show when={props.error}>
        <text fg={theme.textMuted} wrapMode="word" width="100%">
          Error: {props.error}
        </text>
      </Show>
    </box>
  )
}

export function DialogBackupConfig(props: { dialog: any; directory: string }) {
  const { theme } = useForkTheme()
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 17)
  const defaultPath = `~/opencode-backup-${ts}.json`
  const [destPath, setDestPath] = createSignal(defaultPath)
  const [status, setStatus] = createSignal<"input" | "success" | "error">("input")
  const [errorMsg, setErrorMsg] = createSignal("")
  const [backedFiles, setBackedFiles] = createSignal<string[]>([])
  const [savedFile, setSavedFile] = createSignal("")

  onMount(() => {
    props.dialog.setSize("medium")
  })

  useBindings(() => ({
    enabled: status() === "input",
    bindings: [
      {
        key: "escape",
        desc: "Cancel",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
    ],
  }))

  useBindings(() => ({
    enabled: status() !== "input",
    bindings: [
      {
        key: "escape",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
      {
        key: "q",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      }
    ]
  }))

  const containerHeight = createMemo(() => {
    if (status() === "input") return 11
    if (status() === "error") return 7
    return 7 + Math.min(backedFiles().length, 6)
  })

  return (
    <box
      border={["top", "bottom", "left", "right"]}
      borderColor={status() === "success" ? RGBA.fromInts(0, 200, 100, 255) : RGBA.fromInts(250, 200, 80, 255)}
      customBorderChars={WHITE_BOX_BORDER}
      height={containerHeight()}
      alignItems="flex-start"
      justifyContent="center"
      backgroundColor={theme.backgroundPanel}
      padding={1}
    >
      <box width="100%" alignItems="center" justifyContent="center" marginBottom={1}>
        <text
          fg={status() === "success" ? RGBA.fromInts(0, 200, 100, 255) : RGBA.fromInts(255, 255, 255, 255)}
          attributes={TextAttributes.BOLD}
        >
          {status() === "input" ? "Backup OpenCode All Configs" : status() === "success" ? "Backup Config Success" : "Backup Config Failed"}
        </text>
      </box>

      <Show when={status() === "input"}>
      <box width="100%" marginBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>Backup destination path:</text>
      </box>
      
      <box width="100%" flexDirection="row" alignItems="center" marginBottom={1}>
        <text fg={RGBA.fromInts(255, 200, 0, 255)} attributes={TextAttributes.BOLD} marginRight={1}>❯</text>
        <input
          width="100%"
          value={destPath()}
          onInput={(val) => setDestPath(val)}
          onSubmit={() => {
            const finalPath = destPath().trim() === "" ? defaultPath : destPath()
            const res = performFullBackup(finalPath, props.directory)
            if (res.success) {
              setBackedFiles(res.mergedFiles)
              setSavedFile(res.destFile || "")
              setStatus("success")
            } else {
              setErrorMsg(res.error || "Unknown error")
              setStatus("error")
            }
          }}
          focusedBackgroundColor={RGBA.fromInts(30, 30, 30, 255)}
          focusedTextColor={RGBA.fromInts(255, 255, 255, 255)}
          cursorColor={RGBA.fromInts(255, 200, 0, 255)}
          placeholder={defaultPath}
          placeholderColor={theme.textMuted}
          ref={(r) => {
            if (r) {
              setTimeout(() => {
                if (r && !r.isDestroyed) r.focus()
              }, 1)
            }
          }}
        />
      </box>

        <text fg={theme.textMuted} wrapMode="word" width="100%" marginBottom={1}>
          • [Type/Paste path directly] and press Enter to save
        </text>
        <text fg={theme.textMuted} wrapMode="word" width="100%">
          • Press [ Enter ] to backup config now
        </text>
      </Show>

      <Show when={status() === "error"}>
        <text fg={RGBA.fromInts(250, 80, 80, 255)} wrapMode="word" width="100%">
          Error: {errorMsg()}
        </text>
      </Show>

      <Show when={status() === "success"}>
        <text fg={RGBA.fromInts(255, 255, 255, 255)} marginBottom={1} wrapMode="word" width="100%">
          Saved to: {savedFile().replace(os.homedir(), "~")}
        </text>
        <text fg={theme.textMuted} attributes={TextAttributes.UNDERLINE} marginBottom={1}>
          Backed up {backedFiles().length} files:
        </text>
        <box flexDirection="column" alignItems="flex-start" width="100%">
          {backedFiles().map(f => (
            <text fg={theme.textMuted} wrapMode="word" width="100%">
              • {f.replace(os.homedir(), "~")}
            </text>
          ))}
        </box>
      </Show>

      <box width="100%" alignItems="center" justifyContent="center" marginTop={1}>
        <text fg={theme.textMuted} attributes={TextAttributes.ITALIC}>
          {status() === "input" ? "Press ESC to cancel" : "Press ESC or q to close"}
        </text>
      </box>
    </box>
  )
}

export function DialogRestoreConfig(props: { dialog: any; directory: string }) {
  const { theme } = useForkTheme()
  const [backupPath, setBackupPath] = createSignal("")
  const [status, setStatus] = createSignal<"input" | "success" | "error">("input")
  const [errorMsg, setErrorMsg] = createSignal("")
  const [safetyFile, setSafetyFile] = createSignal("")

  onMount(() => {
    props.dialog.setSize("medium")
  })

  useBindings(() => ({
    enabled: status() === "input",
    bindings: [
      {
        key: "escape",
        desc: "Cancel",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
    ],
  }))

  useBindings(() => ({
    enabled: status() !== "input",
    bindings: [
      {
        key: "escape",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
      {
        key: "q",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      }
    ]
  }))

  const containerHeight = createMemo(() => {
    if (status() === "input") return 11
    if (status() === "error") return 7
    return safetyFile() ? 9 : 7
  })

  return (
    <box
      border={["top", "bottom", "left", "right"]}
      borderColor={status() === "success" ? RGBA.fromInts(0, 200, 100, 255) : RGBA.fromInts(250, 200, 80, 255)}
      customBorderChars={WHITE_BOX_BORDER}
      height={containerHeight()}
      alignItems="flex-start"
      justifyContent="center"
      backgroundColor={theme.backgroundPanel}
      padding={1}
    >
      <box width="100%" alignItems="center" justifyContent="center" marginBottom={1}>
        <text
          fg={status() === "success" ? RGBA.fromInts(0, 200, 100, 255) : RGBA.fromInts(255, 255, 255, 255)}
          attributes={TextAttributes.BOLD}
        >
          {status() === "input" ? "Restore OpenCode Config" : status() === "success" ? "Restore Config Success" : "Restore Config Failed"}
        </text>
      </box>

      <Show when={status() === "input"}>
      <box width="100%" marginBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>Backup file path to restore:</text>
      </box>
      
      <box width="100%" flexDirection="row" alignItems="center" marginBottom={1}>
        <text fg={RGBA.fromInts(255, 200, 0, 255)} attributes={TextAttributes.BOLD} marginRight={1}>❯</text>
        <input
          width="100%"
          value={backupPath()}
          onInput={(val) => setBackupPath(val)}
          onSubmit={() => {
            if (backupPath().trim() === "") {
              setErrorMsg("Please specify a backup file path.")
              setStatus("error")
              return
            }
            const res = performFullRestore(backupPath(), props.directory)
            if (res.success) {
              setSafetyFile(res.safetyBackup || "")
              setStatus("success")
            } else {
              setErrorMsg(res.error || "Unknown error")
              setStatus("error")
            }
          }}
          focusedBackgroundColor={RGBA.fromInts(30, 30, 30, 255)}
          focusedTextColor={RGBA.fromInts(255, 255, 255, 255)}
          cursorColor={RGBA.fromInts(255, 200, 0, 255)}
          placeholder="~/path/to/backup.json"
          placeholderColor={theme.textMuted}
          ref={(r) => {
            if (r) {
              setTimeout(() => {
                if (r && !r.isDestroyed) r.focus()
              }, 1)
            }
          }}
        />
      </box>

        <text fg={theme.textMuted} wrapMode="word" width="100%" marginBottom={1}>
          • [Type/Paste path directly] and press Enter to restore
        </text>
        <text fg={theme.textMuted} wrapMode="word" width="100%">
          • Safety backup of existing config will be created automatically
        </text>
      </Show>

      <Show when={status() === "error"}>
        <text fg={RGBA.fromInts(250, 80, 80, 255)} wrapMode="word" width="100%">
          Error: {errorMsg()}
        </text>
      </Show>

      <Show when={status() === "success"}>
        <text fg={RGBA.fromInts(0, 200, 100, 255)} marginBottom={1} wrapMode="word" width="100%">
          Restore completed successfully!
        </text>
        <Show when={safetyFile()}>
          <text fg={theme.textMuted} wrapMode="word" width="100%">
            Safety backup of previous config saved to: {safetyFile().replace(os.homedir(), "~")}
          </text>
        </Show>
      </Show>

      <box width="100%" alignItems="center" justifyContent="center" marginTop={1}>
        <text fg={theme.textMuted} attributes={TextAttributes.ITALIC}>
          {status() === "input" ? "Press ESC to cancel" : "Press ESC or q to close"}
        </text>
      </box>
    </box>
  )
}

function resolveDir(dir: string): string {
  const idx = dir.lastIndexOf(":")
  let resolved = idx > 0 ? dir.substring(0, idx) : dir
  if (resolved.startsWith("~")) {
    resolved = resolved.replace("~", os.homedir())
  }
  return resolved
}

export function DialogTestAPI(props: { dialog: any }) {
  const { theme } = useForkTheme()
  const dimensions = useTerminalDimensions()
  const [results, setResults] = createSignal<ProviderTestResult[]>([])
  const [providers, setProviders] = createSignal<ProviderTestEntry[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [isTesting, setIsTesting] = createSignal(false)
  const [testingIndex, setTestingIndex] = createSignal(-1)
  let abortController = new AbortController()

  // Use colors from standalone
  const GREEN = colors.green
  const RED = colors.red
  const DIM = colors.dim
  const HIGHLIGHT = colors.highlight
  const CYAN = colors.cyan
  const AMBER = colors.amber
  const TEXT = colors.text
  const MUTED = colors.muted
  const BORDER = colors.border

  onMount(() => {
    props.dialog.setSize("xlarge")
    const config = loadConfig()
    const entries = getTestableProviders(config)
    setProviders(entries)
    setResults(entries.map((p) => ({
      providerId: p.providerId,
      name: p.name,
      modelId: p.modelId,
      modelName: p.modelName,
      status: "idle" as const,
      authStatus: "idle" as const,
    })))
  })

  onCleanup(() => {
    abortController.abort()
  })

  async function runTests() {
    abortController.abort()
    abortController = new AbortController()
    setIsTesting(true)

    const entries = providers()
    const initialResults: ProviderTestResult[] = entries.map((p) => ({
      providerId: p.providerId,
      name: p.name,
      modelId: p.modelId,
      modelName: p.modelName,
      status: "testing" as const,
      authStatus: "idle" as const,
    }))
    setResults(initialResults)

    for (let i = 0; i < entries.length; i++) {
      if (abortController.signal.aborted) break
      setTestingIndex(i)
      const p = entries[i]

      const apiRes = await testProvider(p, abortController.signal)
      if (abortController.signal.aborted) break
      setResults((prev) => {
        const next = [...prev]
        next[i] = {
          ...next[i],
          status: apiRes.success ? "success" : "error",
          latency: apiRes.latency,
          errorMessage: apiRes.errorMessage,
          authStatus: "testing",
        }
        return next
      })

      const authRes = await testAuth(p, abortController.signal)
      if (abortController.signal.aborted) break
      setResults((prev) => {
        const next = [...prev]
        next[i] = {
          ...next[i],
          authStatus: authRes.success ? "success" : "error",
          authLatency: authRes.latency,
          authError: authRes.errorMessage,
        }
        return next
      })
    }

    setTestingIndex(-1)
    setIsTesting(false)
  }

  async function runSingleTest(index: number) {
    const entries = providers()
    if (index < 0 || index >= entries.length) return
    const p = entries[index]

    setResults((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], status: "testing", authStatus: "idle" }
      return next
    })

    const apiRes = await testProvider(p, abortController.signal)
    setResults((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        status: apiRes.success ? "success" : "error",
        latency: apiRes.latency,
        errorMessage: apiRes.errorMessage,
        authStatus: "testing",
      }
      return next
    })

    const authRes = await testAuth(p, abortController.signal)
    setResults((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        authStatus: authRes.success ? "success" : "error",
        authLatency: authRes.latency,
        authError: authRes.errorMessage,
      }
      return next
    })
  }

  function moveSelection(delta: number) {
    const len = results().length
    if (len === 0) return
    setSelectedIndex((prev) => (prev + delta + len) % len)
  }

  useBindings(() => ({
    bindings: [
      {
        key: "escape",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
      {
        key: "q",
        desc: "Close",
        group: "Dialog",
        cmd: () => props.dialog.clear(),
      },
      {
        key: "up",
        desc: "Previous",
        group: "Dialog",
        cmd: () => { moveSelection(-1); return true },
      },
      {
        key: "k",
        desc: "Previous",
        group: "Dialog",
        cmd: () => { moveSelection(-1); return true },
      },
      {
        key: "down",
        desc: "Next",
        group: "Dialog",
        cmd: () => { moveSelection(1); return true },
      },
      {
        key: "j",
        desc: "Next",
        group: "Dialog",
        cmd: () => { moveSelection(1); return true },
      },
      {
        key: "return",
        desc: "Test Selected",
        group: "Dialog",
        cmd: () => {
          if (!isTesting()) {
            queueMicrotask(() => runSingleTest(selectedIndex()))
          }
          return true
        },
      },
      {
        key: "t",
        desc: "Test All",
        group: "Dialog",
        cmd: () => {
          if (!isTesting()) {
            queueMicrotask(() => runTests())
          }
          return true
        },
      },
      {
        key: "r",
        desc: "Re-test All",
        group: "Dialog",
        cmd: () => {
          if (!isTesting()) {
            queueMicrotask(() => runTests())
          }
          return true
        },
      },
    ],
  }))

  const selected = createMemo(() => results()[selectedIndex()])
  const selectedProvider = createMemo(() => providers()[selectedIndex()])

  const containerHeight = createMemo(() => {
    const count = results().length
    const headerLines = 3 // title + header row + separator
    const dataLines = Math.max(count, 1)
    const detailLines = 5 // detail panel
    const footerLines = 2 // key hints
    const padding = 2
    return headerLines + dataLines + detailLines + footerLines + padding
  })

  return (
    <box
      height={containerHeight()}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      padding={1}
      paddingLeft={2}
      paddingRight={2}
    >
      {/* Title */}
      <box width="100%" alignItems="center" justifyContent="center" marginBottom={1}>
        <text fg={CYAN} attributes={TextAttributes.BOLD}>
          {" "}󰄲  Provider Connectivity Test
        </text>
      </box>

      {/* Table Header */}
      <box flexDirection="row" width="100%" marginBottom={0}>
        <text fg={DIM} attributes={TextAttributes.UNDERLINE} width={3}> </text>
        <text fg={DIM} attributes={TextAttributes.UNDERLINE}>
          {formatRow("Provider", "API Status", "Latency", "Auth Status", "Latency", "Model", getColumnWidthsByTerminalWidth(dimensions().width))}
        </text>
      </box>

      {/* Separator */}
      <box width="100%" marginBottom={0}>
        <text fg={BORDER} wrapMode="none">
          {"\u2500".repeat(120)}
        </text>
      </box>

      {/* Provider rows */}
      <box flexDirection="column" width="100%">
        <Show when={results().length === 0}>
          <text fg={DIM} wrapMode="none" marginBottom={1}>
            {"  No API-key-based providers found in opencode.json"}
          </text>
        </Show>
        <For each={results()}>
          {(r: ProviderTestResult, i) => {
            const isSelected = createMemo(() => selectedIndex() === i())
            const isCurrentlyTesting = createMemo(() => testingIndex() === i())

            const apiIcon = r.status === "success" ? "✓" : r.status === "error" ? "✗" : r.status === "testing" ? "⏳" : "○"
            const apiLabel = r.status === "success"
              ? "Connected"
              : r.status === "error"
                ? (r.errorMessage ?? "Error").length > 12
                  ? (r.errorMessage ?? "Error").slice(0, 11) + "…"
                  : (r.errorMessage ?? "Error")
                : r.status === "testing" ? "Testing…" : "Pending"
            const apiLatency = r.latency != null ? `${r.latency}ms` : r.status === "testing" ? "…" : "—"

            const authIcon = r.authStatus === "success" ? "✓" : r.authStatus === "error" ? "✗" : r.authStatus === "testing" ? "⏳" : "○"
            const authLabel = r.authStatus === "success"
              ? "Valid"
              : r.authStatus === "error"
                ? (r.authError ?? "Error").length > 12
                  ? (r.authError ?? "Error").slice(0, 11) + "…"
                  : (r.authError ?? "Error")
                : r.authStatus === "testing" ? "Testing…" : "Pending"
            const authLatency = r.authLatency != null ? `${r.authLatency}ms` : r.authStatus === "testing" ? "…" : "—"

            // Green row if both API and Auth success, white otherwise
            const rowColor = (r.status === "success" && r.authStatus === "success") ? GREEN : TEXT

            const widths = getColumnWidthsByTerminalWidth(dimensions().width)
            const rowText = formatRow(
              `${apiIcon} ${r.name}`,
              `${apiIcon} ${apiLabel}`,
              apiLatency,
              `${authIcon} ${authLabel}`,
              authLatency,
              r.modelId,
              widths
            )

            return (
              <box
                flexDirection="row"
                width="100%"
                backgroundColor={isSelected() ? HIGHLIGHT : undefined}
              >
                <text width={3} fg={isSelected() ? CYAN : undefined} wrapMode="none">
                  {isSelected() ? "▸ " : "  "}
                </text>
                <text fg={isSelected() ? CYAN : rowColor} wrapMode="none">
                  {rowText}
                </text>
              </box>
            )
          }}
        </For>
      </box>

      {/* Detail panel */}
      <Show when={selected()}>
        <box width="100%" marginTop={1} flexDirection="column">
          <text fg={BORDER} wrapMode="none">
            {"\u2500".repeat(120)}
          </text>
          <box flexDirection="row" width="100%" marginTop={0} gap={2}>
            <text fg={CYAN} wrapMode="none">
              {"▸ "}
            </text>
            <text fg={TEXT} wrapMode="none">
              {selected()!.providerId}
            </text>
            <text fg={MUTED} wrapMode="none">
              {"  " + selected()!.name}
            </text>
          </box>
          <Show when={selectedProvider()}>
            <box flexDirection="row" width="100%" gap={2}>
              <text fg={DIM} wrapMode="none">{"  Model:  "}</text>
              <text fg={TEXT} wrapMode="none">
                {selected()!.modelId}
              </text>
            </box>
            <box flexDirection="row" width="100%" gap={2}>
              <text fg={DIM} wrapMode="none">{"  URL:    "}</text>
              <text fg={MUTED} wrapMode="none">
                {selectedProvider()!.baseURL.length > 70
                  ? selectedProvider()!.baseURL.slice(0, 69) + "…"
                  : selectedProvider()!.baseURL}
              </text>
            </box>
            <box flexDirection="row" width="100%" gap={2}>
              <text fg={DIM} wrapMode="none">{"  Key:    "}</text>
              <text fg={DIM} wrapMode="none">
                {selectedProvider()
                  ? "••••" + selectedProvider()!.apiKey.slice(-4)
                  : "—"}
              </text>
            </box>
            <box flexDirection="row" width="100%" gap={2}>
              <text fg={DIM} wrapMode="none">{"  API:    "}</text>
              <text fg={selected()!.status === "success" ? GREEN : selected()!.status === "error" ? RED : DIM} wrapMode="none">
                {selected()!.status === "success" ? "✓ Connected" : selected()!.status === "error" ? `✗ ${selected()!.errorMessage ?? "Error"}` : selected()!.status === "testing" ? "⏳ Testing…" : "○ Pending"}
              </text>
              <text fg={DIM} wrapMode="none">
                {selected()!.latency != null ? `(${selected()!.latency}ms)` : "(—)"}
              </text>
            </box>
            <box flexDirection="row" width="100%" gap={2}>
              <text fg={DIM} wrapMode="none">{"  Auth:   "}</text>
              <text fg={selected()!.authStatus === "success" ? GREEN : selected()!.authStatus === "error" ? RED : DIM} wrapMode="none">
                {selected()!.authStatus === "success" ? "✓ Valid" : selected()!.authStatus === "error" ? `✗ ${selected()!.authError ?? "Error"}` : selected()!.authStatus === "testing" ? "⏳ Testing…" : "○ Pending"}
              </text>
              <text fg={DIM} wrapMode="none">
                {selected()!.authLatency != null ? `(${selected()!.authLatency}ms)` : "(—)"}
              </text>
            </box>
          </Show>
        </box>
      </Show>

      {/* Footer key hints */}
      <box width="100%" alignItems="center" justifyContent="center" marginTop={1}>
        <text fg={DIM}>
          <span style={{ fg: CYAN, bold: true }}>↑↓</span>
          <span style={{ fg: DIM }}> navigate  </span>
          <span style={{ fg: CYAN, bold: true }}>Enter</span>
          <span style={{ fg: DIM }}> test  </span>
          <span style={{ fg: CYAN, bold: true }}>t</span>
          <span style={{ fg: DIM }}> test all  </span>
          <span style={{ fg: CYAN, bold: true }}>r</span>
          <span style={{ fg: DIM }}> re-test  </span>
          <span style={{ fg: CYAN, bold: true }}>q</span>
          <span style={{ fg: DIM }}> close</span>
        </text>
      </box>
    </box>
  )
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
  scrollRef: Accessor<any>,
  promptRef: Accessor<MinimalPromptRef | undefined>,
  copyMode: {
    enter: () => void
    exit: () => void
    move: (action: "up" | "down" | "left" | "right") => void
    jump: (action: "top" | "bottom" | "high" | "middle" | "low") => void
    clamp: (delta: number) => void
    active: Accessor<boolean>
  },
  dialog: any,
  directory: Accessor<string>,
  menu: Accessor<LeaderGroup[]>,
) {
  const { isNormal, enterInsert, isLeaderActive, setLeaderActive, leaderGroup, setLeaderGroup, leaderSelectedIndex, setLeaderSelectedIndex } = useVimMode()
  const kv = useKV()
  const renderer = useRenderer()
  const keymap = useOpencodeKeymap()
  let wasNormal: boolean | undefined = undefined
  let spaceActive = false

  const selectableItems = createMemo(() => {
    const group = menu().find((item) => item.key === leaderGroup())
    const items = group ? group.items : menu()
    return items.filter((item) => !isSeparator(item as any)) as (LeaderLeaf | LeaderGroup)[]
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

  const submitDraftOrFocusPrompt = () => {
    const prompt = promptRef()
    if (prompt && (prompt.current.input !== "" || prompt.current.parts.length > 0)) {
      prompt.submit()
      return true
    }
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
      spaceActive = false
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
    } catch (e: any) {
      dialog.replace(() => (
        <DialogLazyGit dialog={dialog} error={e?.message || String(e)} />
      ))
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
  }

  const runLazyVim = (rendererInstance: any, cwd: string) => {
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
    } catch (e: any) {
      // Silently ignore errors (e.g., user quit editor)
      console.error("LazyVim error:", e?.message || String(e))
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
    } catch (e: any) {
      dialog.replace(() => (
        <DialogLazyGit dialog={dialog} error={`${cmd}: ${e?.message || String(e)}`} />
      ))
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
      if (entry.action === "backup") {
        dialog.replace(() => <DialogBackupConfig dialog={dialog} directory={directory()} />)
        return
      }
      if (entry.action === "restore") {
        dialog.replace(() => <DialogRestoreConfig dialog={dialog} directory={directory()} />)
        return
      }
      if (entry.action === "api_test") {
        dialog.replace(() => <DialogTestAPI dialog={dialog} />)
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
          ;(globalThis as any).__SKILL_FILTER__ = entry.skill
          // Trigger the skill command
          keymap.dispatchCommand("prompt.skills")
        })
        return
      }
      if (entry.action === "command" && entry.command) {
        keymap.dispatchCommand(entry.command)
        return
      }
      // Legacy: no action specified, treat as command
      if (!entry.action && entry.command) {
        keymap.dispatchCommand(entry.command)
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
    const focused = renderer.currentFocusedRenderable
    if (focused) {
      const name = focused.constructor?.name
      if (
        name === "TextareaRenderable" ||
        name === "InputRenderable" ||
        "plainText" in focused ||
        typeof (focused as any).insertText === "function" ||
        typeof (focused as any).setText === "function"
      ) {
        return false
      }
    }
    return true
  }

  const isVimEnabled = createMemo(() => isNormal() && dialog.stack.length === 0)

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
              runLeaderLeaf(selected)
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
        key: "return",
        when: () => isVimNormalActive() && kv.get("minimal_vim_enter_focus_prompt", true) && !isLeaderActive(),
        cmd: () => submitDraftOrFocusPrompt(),
      },
      {
        key: "enter",
        when: () => isVimNormalActive() && kv.get("minimal_vim_enter_focus_prompt", true) && !isLeaderActive(),
        cmd: () => submitDraftOrFocusPrompt(),
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
  dialog: any,
  directory: Accessor<string>,
  menu: Accessor<LeaderGroup[]>,
) {
  const { isNormal, enterInsert, isLeaderActive, setLeaderActive, leaderGroup, setLeaderGroup, leaderSelectedIndex, setLeaderSelectedIndex } = useVimMode()
  const kv = useKV()
  const renderer = useRenderer()
  const keymap = useOpencodeKeymap()

  const selectableItems = createMemo(() => {
    const group = menu().find((item) => item.key === leaderGroup())
    const items = group ? group.items : menu()
    return items.filter((item) => !isSeparator(item as any)) as (LeaderLeaf | LeaderGroup)[]
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

  const submitDraftOrFocusPrompt = () => {
    const prompt = promptRef()
    if (prompt && (prompt.current.input !== "" || prompt.current.parts.length > 0)) {
      prompt.submit()
      return true
    }
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
    } catch (e: any) {
      dialog.replace(() => (
        <DialogLazyGit dialog={dialog} error={e?.message || String(e)} />
      ))
    } finally {
      renderer.currentRenderBuffer.clear()
      renderer.resume()
      renderer.requestRender()
    }
  }

  const runLazyVim = (rendererInstance: any, cwd: string) => {
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
      dialog.replace(() => (
        <DialogLazyGit dialog={dialog} error="No editor found (tried: nvim, vim, vi)" />
      ))
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
    } catch (e: any) {
      dialog.replace(() => (
        <DialogLazyGit dialog={dialog} error={`LazyVim: ${e?.message || String(e)}`} />
      ))
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
    } catch (e: any) {
      dialog.replace(() => (
        <DialogLazyGit dialog={dialog} error={`${cmd}: ${e?.message || String(e)}`} />
      ))
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
      if (entry.action === "backup") {
        dialog.replace(() => <DialogBackupConfig dialog={dialog} directory={directory()} />)
        return
      }
      if (entry.action === "restore") {
        dialog.replace(() => <DialogRestoreConfig dialog={dialog} directory={directory()} />)
        return
      }
      if (entry.action === "api_test") {
        dialog.replace(() => <DialogTestAPI dialog={dialog} />)
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
        keymap.dispatchCommand(entry.command)
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
    const focused = renderer.currentFocusedRenderable
    if (focused) {
      const name = focused.constructor?.name
      if (
        name === "TextareaRenderable" ||
        name === "InputRenderable" ||
        "plainText" in focused ||
        typeof (focused as any).insertText === "function" ||
        typeof (focused as any).setText === "function"
      ) {
        return false
      }
    }
    return true
  }

  const isVimEnabled = createMemo(() => isNormal() && dialog.stack.length === 0)

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
              runLeaderLeaf(selected)
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
        key: "return",
        when: () => isVimNormalActive() && kv.get("minimal_vim_enter_focus_prompt", true) && !isLeaderActive(),
        cmd: () => submitDraftOrFocusPrompt(),
      },
      {
        key: "enter",
        when: () => isVimNormalActive() && kv.get("minimal_vim_enter_focus_prompt", true) && !isLeaderActive(),
        cmd: () => submitDraftOrFocusPrompt(),
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
