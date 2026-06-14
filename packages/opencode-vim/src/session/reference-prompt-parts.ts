import path from "path"
import { pathToFileURL } from "url"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ConfigMarkdown } from "@/config/markdown"
import { type Resolved, referenceTextPart } from "./reference-local"
import { Filesystem } from "@/util/filesystem"

export type ReferencePromptPartInput =
  | ReturnType<typeof referenceTextPart>
  | {
      type: "file"
      mime: string
      filename: string
      url: string
      source?: {
        type: "file"
        text: { value: string; start: number; end: number }
        path: string
      }
    }

export async function expandReferencePathMentions(input: {
  text: string
  references: Resolved[]
}): Promise<ReferencePromptPartInput[]> {
  const referenceByName = new Map(input.references.map((item) => [item.name, item]))
  const parts: ReferencePromptPartInput[] = []
  const seen = new Set<string>()

  for (const match of ConfigMarkdown.files(input.text)) {
    const name = match[1]
    if (!name) continue

    const slash = name.indexOf("/")
    if (slash === -1) continue

    if (seen.has(name)) continue
    seen.add(name)

    const alias = name.slice(0, slash)
    const reference = referenceByName.get(alias)
    if (!reference) continue

    const start = match.index ?? 0
    const source = { value: match[0], start, end: start + match[0].length }
    const target = name.slice(slash + 1)

    if (reference.kind === "invalid") {
      parts.push(referenceTextPart({ reference, source, target }))
      continue
    }

    const targetPath = path.resolve(reference.path, target)
    if (!FSUtil.contains(reference.path, targetPath)) {
      parts.push(
        referenceTextPart({
          reference,
          source,
          target,
          targetPath,
          problem: `Path escapes configured reference @${alias}: ${target}`,
        }),
      )
      continue
    }

    const stat = await Filesystem.statAsync(targetPath)
    if (!stat) {
      parts.push(
        referenceTextPart({
          reference,
          source,
          target,
          targetPath,
          problem: `Path does not exist inside configured reference @${alias}: ${target}`,
        }),
      )
      continue
    }

    parts.push({
      type: "file",
      mime: stat.isDirectory() ? "application/x-directory" : "text/plain",
      filename: name,
      url: pathToFileURL(targetPath).href,
      source: { type: "file", text: source, path: name },
    })
  }

  return parts
}

export function mergeReferencePromptParts<T extends { type: string; url?: string; mime?: string }>(
  base: T[],
  expanded: ReferencePromptPartInput[],
): T[] {
  const attached = new Set(
    base.flatMap((part) =>
      part.type === "file" && part.mime === "application/x-directory" && part.url ? [part.url] : [],
    ),
  )
  const extra: T[] = []

  for (const part of expanded) {
    if (part.type === "file") {
      if (attached.has(part.url)) continue
      attached.add(part.url)
    }
    extra.push(part as unknown as T)
  }

  return [...base, ...extra]
}