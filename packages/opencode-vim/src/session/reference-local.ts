import path from "path"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import type { Entry as ConfigEntry, Info as ConfigInfo } from "@opencode-ai/core/config/reference"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { parseRepositoryReference, repositoryCachePath } from "@/util/repository"

// --- Resolved type (moved from @/reference/reference) ---

export type Resolved =
  | {
      name: string
      kind: "local"
      path: string
    }
  | {
      name: string
      kind: "git"
      repository: string
      reference: ReturnType<typeof parseRepositoryReference>
      path: string
      branch?: string
    }
  | {
      name: string
      kind: "invalid"
      repository?: string
      message: string
    }

// --- ConfigReference types (moved from @/config/reference) ---

export type NormalizedEntry =
  | { kind: "local"; path: string }
  | { kind: "git"; repository: string; branch?: string }
  | { kind: "invalid"; message: string }

export type NormalizedInfo = Record<string, NormalizedEntry>

export function validateAlias(name: string) {
  if (name.length === 0) return "Reference alias must not be empty"
  if (/[\/\s`,]/.test(name)) {
    return "Reference alias must not contain /, whitespace, comma, or backtick"
  }
}

export function normalizeEntry(entry: ConfigEntry): NormalizedEntry {
  if (typeof entry === "string") {
    if (entry.startsWith(".") || entry.startsWith("/") || entry.startsWith("~")) {
      return { kind: "local", path: entry }
    }
    return { kind: "git", repository: entry }
  }
  if ("path" in entry) return { kind: "local", path: entry.path }
  return { kind: "git", repository: entry.repository, branch: entry.branch }
}

export function normalize(info: ConfigInfo): NormalizedInfo {
  return Object.fromEntries(
    Object.entries(info).map(([name, entry]) => {
      const aliasError = validateAlias(name)
      return [name, aliasError ? { kind: "invalid" as const, message: aliasError } : normalizeEntry(entry)] as const
    }),
  )
}

// --- Resolve functions (moved from @/reference/reference) ---

export function referencePath(input: { directory: string; worktree: string; value: string }) {
  if (input.value.startsWith("~/")) return path.join(Global.Path.home, input.value.slice(2))
  return path.isAbsolute(input.value)
    ? input.value
    : path.resolve(input.worktree === "/" ? input.directory : input.worktree, input.value)
}

function resolveGit(
  input: { name: string; repository: string } | { name: string; repository: string; branch: string | undefined },
): Resolved {
  const parsed = parseRepositoryReference(input.repository)
  if (!parsed || parsed.protocol === "file:") {
    return {
      name: input.name,
      kind: "invalid",
      repository: input.repository,
      message: "Repository must be a git URL, host/path reference, or GitHub owner/repo shorthand",
    }
  }
  return {
    name: input.name,
    kind: "git",
    repository: input.repository,
    reference: parsed,
    path: repositoryCachePath(parsed),
    ...("branch" in input ? { branch: input.branch } : {}),
  }
}

export function resolve(input: {
  name: string
  reference: NormalizedEntry
  directory: string
  worktree: string
}): Resolved {
  if (input.reference.kind === "invalid") {
    return { name: input.name, kind: "invalid", message: input.reference.message }
  }
  if (input.reference.kind === "local") {
    return { name: input.name, kind: "local", path: referencePath({ ...input, value: input.reference.path }) }
  }
  return resolveGit({ name: input.name, repository: input.reference.repository, branch: input.reference.branch })
}

function branchLabel(branch: string | undefined) {
  return branch ?? "default branch"
}

export function resolveAll(input: { references: NormalizedInfo; directory: string; worktree: string }) {
  const seen = new Map<string, { name: string; branch?: string }>()
  return Object.entries(input.references).map(([name, reference]) => {
    const resolved = resolve({ name, reference, directory: input.directory, worktree: input.worktree })
    if (resolved.kind !== "git") return resolved
    const existing = seen.get(resolved.path)
    if (!existing) {
      seen.set(resolved.path, { name, branch: resolved.branch })
      return resolved
    }
    if (existing.branch === resolved.branch) return resolved
    return {
      name,
      kind: "invalid" as const,
      repository: resolved.repository,
      message: `Reference conflicts with @${existing.name}: both use ${resolved.path}, but @${existing.name} requests ${branchLabel(existing.branch)} and @${name} requests ${branchLabel(resolved.branch)}`,
    }
  })
}

// --- Reference prompt metadata (moved from @/session/prompt/reference) ---

interface ReferencePromptSource {
  value: string
  start: number
  end: number
}

export interface ReferencePromptMetadata {
  name: string
  kind: "local" | "git" | "invalid"
  path?: string
  repository?: string
  branch?: string
  target?: string
  targetPath?: string
  problem?: string
  source: ReferencePromptSource
}

export function referenceTextPart(input: {
  reference: Resolved
  source: ReferencePromptMetadata["source"]
  target?: string
  targetPath?: string
  problem?: string
}): SessionV1.TextPartInput {
  const metadata: ReferencePromptMetadata = {
    name: input.reference.name,
    kind: input.reference.kind,
    ...(input.reference.kind === "invalid"
      ? { repository: input.reference.repository }
      : { path: input.reference.path }),
    ...(input.reference.kind === "git"
      ? { repository: input.reference.repository, branch: input.reference.branch }
      : {}),
    ...(input.target === undefined ? {} : { target: input.target }),
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    problem: input.problem ?? (input.reference.kind === "invalid" ? input.reference.message : undefined),
    source: input.source,
  }
  const label = metadata.target === undefined ? `@${metadata.name}` : `@${metadata.name}/${metadata.target}`
  return {
    type: "text",
    synthetic: true,
    text: [
      `Referenced configured reference ${label}.`,
      ...(metadata.kind === "local" ? ["Kind: local directory"] : []),
      ...(metadata.kind === "git" ? ["Kind: git repository"] : []),
      ...(metadata.repository ? [`Repository: ${metadata.repository}`] : []),
      ...(metadata.branch ? [`Branch/ref: ${metadata.branch}`] : []),
      ...(metadata.path ? [`Reference root: ${metadata.path}`] : []),
      ...(metadata.targetPath ? [`Resolved path: ${metadata.targetPath}`] : []),
      ...(metadata.problem
        ? [`Problem: ${metadata.problem}`]
        : ["Inspect the configured reference with Read, Glob, and Grep when useful."]),
    ].join("\n"),
    metadata: { reference: metadata },
  }
}
