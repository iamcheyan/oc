import * as OpenTuiCore from "@opentui/core"

type Color = {
  r: number
  g: number
  b: number
  a: number
  toInts?: () => number[]
}

type BufferRuntime = {
  bufferPtr: unknown
  lib: {
    bufferFillRect: (...args: unknown[]) => void
  }
  buffers: {
    char: Uint32Array
    fg: Uint16Array
    bg: Uint16Array
  }
  width: number
  height: number
}

type DrawBoxOptions = {
  x: number
  y: number
  width: number
  height: number
  backgroundColor: Color
  shouldFill?: boolean
  [key: string]: unknown
}

type BufferPrototype = {
  fillRect: (x: number, y: number, width: number, height: number, color: Color) => void
  drawBox: (options: DrawBoxOptions) => void
}

const PATCHED = Symbol.for("opencode-vim.cjk-safe-overlay")

function colorComponents(color: Color) {
  if (typeof color.toInts === "function") return color.toInts()
  return [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    Math.round(color.a * 255),
  ]
}

function blendChannel(base: number, overlay: number, alpha: number, inverse: number) {
  return Math.round(base * inverse + overlay * alpha)
}

function fillRectCjkSafe(buffer: BufferRuntime, x: number, y: number, width: number, height: number, color: Color) {
  const [red, green, blue, opacity] = colorComponents(color)
  if (opacity === 0) return
  if (opacity === 255) {
    buffer.lib.bufferFillRect(buffer.bufferPtr, x, y, width, height, color)
    return
  }

  const alpha = opacity / 255
  const inverse = 1 - alpha

  for (let dy = 0; dy < height; dy++) {
    const cellY = y + dy
    if (cellY < 0 || cellY >= buffer.height) continue

    for (let dx = 0; dx < width; dx++) {
      const cellX = x + dx
      if (cellX < 0 || cellX >= buffer.width) continue

      const cellIndex = cellY * buffer.width + cellX
      const colorIndex = cellIndex * 4
      const bgAlpha = buffer.buffers.bg[colorIndex + 3]

      if (bgAlpha === 0) {
        buffer.buffers.bg[colorIndex] = red
        buffer.buffers.bg[colorIndex + 1] = green
        buffer.buffers.bg[colorIndex + 2] = blue
        buffer.buffers.bg[colorIndex + 3] = opacity
      } else {
        buffer.buffers.bg[colorIndex] = blendChannel(buffer.buffers.bg[colorIndex], red, alpha, inverse)
        buffer.buffers.bg[colorIndex + 1] = blendChannel(buffer.buffers.bg[colorIndex + 1], green, alpha, inverse)
        buffer.buffers.bg[colorIndex + 2] = blendChannel(buffer.buffers.bg[colorIndex + 2], blue, alpha, inverse)
        buffer.buffers.bg[colorIndex + 3] = 255
      }

      buffer.buffers.fg[colorIndex] = blendChannel(buffer.buffers.fg[colorIndex], red, alpha, inverse)
      buffer.buffers.fg[colorIndex + 1] = blendChannel(buffer.buffers.fg[colorIndex + 1], green, alpha, inverse)
      buffer.buffers.fg[colorIndex + 2] = blendChannel(buffer.buffers.fg[colorIndex + 2], blue, alpha, inverse)
      buffer.buffers.fg[colorIndex + 3] = 255

      if (buffer.buffers.char[cellIndex] === 0) buffer.buffers.char[cellIndex] = 32
    }
  }
}

export function installCjkSafeOverlayPatch() {
  const core = OpenTuiCore as unknown as {
    OptimizedBuffer: {
      prototype: BufferPrototype & {
        [PATCHED]?: true
      }
    }
  }
  const proto = core.OptimizedBuffer.prototype
  if (proto[PATCHED]) return

  const originalDrawBox = proto.drawBox

  proto.fillRect = function (x, y, width, height, color) {
    fillRectCjkSafe(this as unknown as BufferRuntime, x, y, width, height, color)
  }

  proto.drawBox = function (options) {
    const background = options.backgroundColor
    if (options.shouldFill && background.a > 0 && background.a < 1) {
      fillRectCjkSafe(this as unknown as BufferRuntime, options.x, options.y, options.width, options.height, background)
      return originalDrawBox.call(this, {
        ...options,
        shouldFill: false,
      })
    }
    return originalDrawBox.call(this, options)
  }

  proto[PATCHED] = true
}
