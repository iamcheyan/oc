import { describe, expect, test } from "bun:test"
import {
  getFirstChildSessionID,
  getParentSessionID,
  getSiblingChildSessionID,
} from "../src/session-navigation"

const sessions = [
  { id: "parent" },
  { id: "child-1", parentID: "parent" },
  { id: "child-2", parentID: "parent" },
  { id: "child-3", parentID: "parent" },
] as const

describe("session navigation", () => {
  test("returns the first child session", () => {
    expect(getFirstChildSessionID(sessions)).toBe("child-1")
    expect(getFirstChildSessionID([{ id: "parent" }])).toBeUndefined()
  })

  test("returns the current session parent", () => {
    expect(getParentSessionID({ id: "child-2", parentID: "parent" })).toBe("parent")
    expect(getParentSessionID({ id: "parent" })).toBeUndefined()
    expect(getParentSessionID(undefined)).toBeUndefined()
  })

  test("cycles to the next child session with wraparound", () => {
    expect(getSiblingChildSessionID(sessions, "child-1", 1)).toBe("child-2")
    expect(getSiblingChildSessionID(sessions, "child-3", 1)).toBe("child-1")
  })

  test("cycles to the previous child session with wraparound", () => {
    expect(getSiblingChildSessionID(sessions, "child-2", -1)).toBe("child-1")
    expect(getSiblingChildSessionID(sessions, "child-1", -1)).toBe("child-3")
  })

  test("returns undefined when there is no sibling child target", () => {
    expect(getSiblingChildSessionID([{ id: "parent" }], "parent", 1)).toBeUndefined()
    expect(getSiblingChildSessionID([{ id: "parent" }, { id: "child", parentID: "parent" }], "missing", 1)).toBe("child")
  })
})
