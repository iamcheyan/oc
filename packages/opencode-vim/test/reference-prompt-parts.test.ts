import { describe, expect, test } from "bun:test"
import path from "path"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { ConfigReference } from "@/config/reference"
import { Reference } from "@/reference/reference"
import { expandReferencePathMentions } from "@/session/reference-prompt-parts"

describe("expandReferencePathMentions", () => {
  const root = path.join(process.cwd(), ".test-reference-prompt-parts")
  const refRoot = path.join(root, "ref-root")

  test("resolves @alias/path to a file part", async () => {
    rmSync(root, { recursive: true, force: true })
    mkdirSync(refRoot, { recursive: true })
    writeFileSync(path.join(refRoot, "note.txt"), "hello")

    const references = Reference.resolveAll({
      references: ConfigReference.normalize({ docs: refRoot }),
      directory: root,
      worktree: root,
    })
    const parts = await expandReferencePathMentions({
      text: "see @docs/note.txt",
      references,
    })

    expect(parts).toHaveLength(1)
    expect(parts[0]?.type).toBe("file")
    if (parts[0]?.type === "file") {
      expect(parts[0].filename).toBe("docs/note.txt")
      expect(parts[0].url).toContain("note.txt")
    }

    rmSync(root, { recursive: true, force: true })
  })

  test("skips @alias without a subpath for server-side resolve", async () => {
    const references = Reference.resolveAll({
      references: ConfigReference.normalize({ docs: refRoot }),
      directory: root,
      worktree: root,
    })
    const parts = await expandReferencePathMentions({
      text: "see @docs",
      references,
    })

    expect(parts).toHaveLength(0)
  })
})