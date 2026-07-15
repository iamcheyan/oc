// Strip JSONC comments and trailing commas, returning parseable JSON text.
// Tolerates malformed input by returning the original string on failure.
export function stripJsonComments(json: string): string {
  let out = ""
  let inString = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < json.length; i++) {
    const char = json[i]
    const next = json[i + 1]

    if (inLineComment) {
      if (char === "\n" || char === "\r") {
        inLineComment = false
        out += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      if (char === '"' && json[i - 1] !== "\\") {
        inString = false
      }
      out += char
      continue
    }

    if (char === '"') {
      inString = true
      out += char
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      i++
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      i++
      continue
    }

    out += char
  }

  return out.replace(/,\s*([\]}])/g, "$1")
}

// Parse JSONC text, returning undefined on any parse error so callers can
// fall back to defaults without try/catch noise.
export function parseJsonc<T = unknown>(text: string): T | undefined {
  try {
    const cleaned = stripJsonComments(text)
    return JSON.parse(cleaned) as T
  } catch {
    return undefined
  }
}