import {
  getFirstChildSessionID,
  getParentSessionID,
  getSiblingChildSessionID,
} from "./session-navigation"

type DemoSession = {
  id: string
  title: string
  parentID?: string
  transcript: string[]
}

const sessions: DemoSession[] = [
  {
    id: "parent",
    title: "Main Agent",
    transcript: [
      "User: investigate reducer bug",
      "Assistant: spawning 3 subagents",
      "Assistant: use up/left/right to inspect navigation",
    ],
  },
  {
    id: "child-1",
    parentID: "parent",
    title: "Explore Subagent",
    transcript: [
      "Scanning reducer entrypoints",
      "Found 4 candidate files",
      "Press up to return to the parent session",
    ],
  },
  {
    id: "child-2",
    parentID: "parent",
    title: "Patch Subagent",
    transcript: [
      "Preparing minimal fix",
      "Session command wiring updated in minimal route",
      "Press left/right to move across sibling subagents",
    ],
  },
  {
    id: "child-3",
    parentID: "parent",
    title: "Test Subagent",
    transcript: [
      "Adding navigation unit tests",
      "Wraparound behavior verified",
      "Press q to quit this demo",
    ],
  },
]

const keyLabels = {
  up: "\u2191",
  left: "\u2190",
  right: "\u2192",
}

function currentSession(sessionID: string) {
  const session = sessions.find((item) => item.id === sessionID)
  if (!session) throw new Error(`Unknown session: ${sessionID}`)
  return session
}

function siblingChildren() {
  return sessions.filter((item) => item.parentID === "parent")
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H")
}

function render(sessionID: string) {
  const session = currentSession(sessionID)
  const parentID = getParentSessionID(session)
  const childIndex = siblingChildren().findIndex((item) => item.id === session.id)
  const childCount = siblingChildren().length
  const footer =
    parentID
      ? `Parent ${keyLabels.up}  Prev ${keyLabels.left}  Next ${keyLabels.right}  Quit q`
      : `Open first child: down  Quit q`

  clearScreen()
  process.stdout.write("opencode-vim subagent demo\n")
  process.stdout.write("===============================\n\n")
  process.stdout.write(`Current session: ${session.title} (${session.id})\n`)
  if (parentID) {
    process.stdout.write(`Parent: ${parentID}\n`)
    process.stdout.write(`Sibling position: ${childIndex + 1} / ${childCount}\n`)
  }
  process.stdout.write("\nTranscript\n")
  process.stdout.write("----------\n")
  for (const line of session.transcript) {
    process.stdout.write(`${line}\n`)
  }
  process.stdout.write("\n")
  process.stdout.write(`${footer}\n`)
}

function decodeKey(buffer: Buffer) {
  const input = buffer.toString("utf8")
  if (input === "q" || input === "\u0003") return "quit"
  if (input === "\u001b[A") return "up"
  if (input === "\u001b[B") return "down"
  if (input === "\u001b[D") return "left"
  if (input === "\u001b[C") return "right"
  return "unknown"
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("This demo requires an interactive TTY.")
  }

  let sessionID = "child-1"

  const cleanup = () => {
    process.stdin.setRawMode(false)
    process.stdin.pause()
    process.stdin.removeAllListeners("data")
    clearScreen()
  }

  process.stdin.setRawMode(true)
  process.stdin.resume()
  render(sessionID)

  process.stdin.on("data", (chunk: Buffer) => {
    const key = decodeKey(chunk)

    if (key === "quit") {
      cleanup()
      process.exit(0)
    }

    if (key === "up") {
      const parentID = getParentSessionID(currentSession(sessionID))
      if (parentID) sessionID = parentID
      render(sessionID)
      return
    }

    if (key === "down") {
      const firstChild = getFirstChildSessionID(sessions)
      if (firstChild && sessionID === "parent") sessionID = firstChild
      render(sessionID)
      return
    }

    if (key === "left") {
      const previous = getSiblingChildSessionID(sessions, sessionID, -1)
      if (previous) sessionID = previous
      render(sessionID)
      return
    }

    if (key === "right") {
      const next = getSiblingChildSessionID(sessions, sessionID, 1)
      if (next) sessionID = next
      render(sessionID)
      return
    }

    render(sessionID)
  })
}

await main()
