#!/usr/bin/env bun

import { copyFile, cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const root = path.resolve(import.meta.dirname, "../../..")
const pkg = path.join(root, "packages/opencode-vim")
const outdir = path.resolve(root, process.argv.find((arg) => arg.startsWith("--outdir="))?.slice("--outdir=".length) ?? "fork/dist/plugin")
if (outdir === pkg || outdir.startsWith(pkg + path.sep)) throw new Error("--outdir must be outside packages/opencode-vim")

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
const result = await Bun.build({
  entrypoints: [path.join(pkg, "src/index.ts")],
  outdir,
  naming: "index.js",
  root: pkg,
  tsconfig: path.join(pkg, "tsconfig.json"),
  plugins: [createSolidTransformPlugin()],
  conditions: ["bun"],
  target: "bun",
  external: [
    "@opencode/plugin",
    "@opencode/tui",
    ...["darwin-arm64", "darwin-x64", "linux-arm64", "linux-arm64-musl", "linux-x64", "linux-x64-musl", "win32-arm64", "win32-x64"].map(
      (target) => `@opentui/core-${target}`,
    ),
  ],
  format: "esm",
  splitting: false,
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
await copyFile(path.join(outdir, "index.js"), path.join(outdir, "tui.js"))
await Bun.write(
  path.join(outdir, "package.json"),
  JSON.stringify(
    {
      name: "@opencode-ai/vim",
      version: process.env.OPENCODE_VERSION ?? "0.0.0-dev",
      type: "module",
      exports: {
        "./tui": "./tui.js",
        "./package.json": "./package.json",
      },
      opencode: { type: "tui-plugin", id: "opencode.vim" },
      dependencies: {
        "@opentui/core": "0.5.17",
        "@opentui/solid": "0.5.17",
        "solid-js": "1.9.15",
      },
    },
    null,
    2,
  ) + "\n",
)
console.log(`Built Vim TUI plugin: ${outdir}`)

const installRoot = await mkdtemp(path.join(tmpdir(), "vim-plugin-host-load-"))
try {
  const modules = path.join(installRoot, "node_modules")
  const bundle = path.join(modules, "@opencode-ai/vim")
  await mkdir(path.dirname(bundle), { recursive: true })
  await cp(outdir, bundle, { recursive: true })

  const expectedVersions = { "@opentui/core": "0.5.17", "@opentui/solid": "0.5.17", "solid-js": "1.9.15" }
  for (const [name, version] of Object.entries(expectedVersions)) {
    const scope = name.replaceAll("/", "+")
    const candidates = [...new Bun.Glob(`${scope}@*/node_modules/${name}/package.json`).scanSync({ cwd: path.join(root, "node_modules/.bun") })]
    const manifestPath = candidates
      .map((candidate) => path.join(root, "node_modules/.bun", candidate))
      .find((candidate) => {
        try {
          return require(candidate).version === version
        } catch {
          return false
        }
      })
    if (!manifestPath) throw new Error(`Host dependency ${name}@${version} is not installed`)
    const link = path.join(modules, name)
    await mkdir(path.dirname(link), { recursive: true })
    await symlink(path.dirname(manifestPath), link, "junction")
  }

  const hostPlugin = path.join(modules, "@opencode", "plugin")
  await mkdir(path.dirname(hostPlugin), { recursive: true })
  await symlink(path.join(root, "packages/plugin"), hostPlugin, "junction")

  const { Host } = await import(path.join(root, "packages/plugin/src/host.ts"))
  const entries = Host.resolve({ directory: bundle, name: "@opencode-ai/vim" })
  if (!entries.tui || entries.server === entries.tui) throw new Error(`Host.resolve returned invalid entrypoints: ${JSON.stringify(entries)}`)
  const loaded = await Host.load(entries.tui) as { default?: { id?: string } }
  if (loaded.default?.id !== "opencode.vim") throw new Error("Host.load did not return the Vim plugin")
  if (await Bun.file(path.join(bundle, "node_modules")).exists()) throw new Error("plugin unexpectedly has local node_modules")
  console.log(`Host.resolve: server=${entries.server}; tui=${entries.tui}`)
  console.log(`Host.load: ${loaded.default.id}; OpenTUI/Solid resolved from host node_modules`)
} finally {
  await rm(installRoot, { recursive: true, force: true })
}

