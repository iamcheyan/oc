import { afterEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { loadConfig } from "./api-test"

const originalHome = process.env.HOME

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME
    return
  }

  process.env.HOME = originalHome
})

describe("loadConfig", () => {
  it("parses opencode.jsonc with comments, trailing commas, and unquoted keys", () => {
    const tempHome = mkdtempSync(path.join(os.tmpdir(), "api-test-home-"))
    try {
      process.env.HOME = tempHome

      const configDir = path.join(tempHome, ".config", "opencode")
      mkdirSync(configDir, { recursive: true })
      writeFileSync(
        path.join(configDir, "opencode.jsonc"),
        `{
          // provider config used by api test
          provider: {
            openrouter: {
              name: "OpenRouter",
              options: {
                baseURL: "https://openrouter.ai/api/v1",
                apiKey: "test-key",
              },
              models: {
                default: {
                  id: "openai/gpt-4.1",
                },
              },
            },
          },
        }`,
      )

      expect(loadConfig()).toEqual({
        provider: {
          openrouter: {
            name: "OpenRouter",
            options: {
              baseURL: "https://openrouter.ai/api/v1",
              apiKey: "test-key",
            },
            models: {
              default: {
                id: "openai/gpt-4.1",
              },
            },
          },
        },
      })
    } finally {
      rmSync(tempHome, { recursive: true, force: true })
    }
  })
})
