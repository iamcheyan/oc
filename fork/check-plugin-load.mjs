import { Host } from "../packages/plugin/src/host.ts"

const bundle = new URL("../fork/dist/plugin/", import.meta.url).pathname
const entries = Host.resolve({ directory: bundle })
if (!entries.tui || entries.server === entries.tui) throw new Error(`Invalid plugin entrypoints: ${JSON.stringify(entries)}`)
const loaded = await Host.load(entries.tui)
if (loaded.default?.id !== "opencode.vim") throw new Error("Vim plugin failed to load")
console.log(`Host.resolve: ${JSON.stringify(entries)}`)
console.log(`Host.load: ${loaded.default.id}`)
