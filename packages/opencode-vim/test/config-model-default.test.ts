import { describe, expect, test } from "bun:test"
import {
  applyConfigModelDefaultToProvidersResponse,
  parseConfigModel,
  providerDefaultFromConfigModel,
} from "@/util/config-model-default"

describe("config model default", () => {
  test("parseConfigModel splits provider and model id", () => {
    expect(parseConfigModel("anthropic/claude-sonnet-4")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
    })
    expect(parseConfigModel("bad")).toBeUndefined()
  })

  test("providerDefaultFromConfigModel overrides upstream default", () => {
    expect(providerDefaultFromConfigModel("openai/gpt-4", { other: "x" })).toEqual({
      openai: "gpt-4",
    })
    expect(providerDefaultFromConfigModel(undefined, { other: "x" })).toEqual({ other: "x" })
  })

  test("applyConfigModelDefaultToProvidersResponse patches response default", () => {
    const response = applyConfigModelDefaultToProvidersResponse(
      { default: { anthropic: "old" }, providers: [] },
      "openai/gpt-4",
    )
    const defaults = response.default as Record<string, string>
    expect(defaults).toEqual({ openai: "gpt-4" })
  })
})