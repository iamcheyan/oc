import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Server } from "@opencode/server/server"
import { bootstrap } from "@opencode/cli/bootstrap"
import path from "path"

async function checkConfig() {
    const directory = path.resolve(".")
    await bootstrap(directory, async () => {
        const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init)
            return Server.Default().app.fetch(request)
        }) as typeof globalThis.fetch

        const sdk = createOpencodeClient({ baseUrl: "http://opencode.internal", fetch: fetchFn })
        
        console.log("--- Current Global Config ---")
        const config = await sdk.global.config.get()
        console.log(JSON.stringify(config.data, null, 2))

        console.log("\n--- Available Providers & Models ---")
        const providers = await sdk.config.providers()
        console.log(JSON.stringify(providers.data, null, 2))
    })
}

checkConfig().catch(console.error)
