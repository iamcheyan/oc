import { RGBA } from "@opentui/core"

/**
 * Get transparent color for minimal mode backgrounds
 * In minimal mode, ignores theme background colors and uses terminal's own colors
 */
export function getMinimalBackground(_theme: unknown, _originalColor?: string | RGBA): RGBA | undefined {
  // Always return undefined (transparent) in minimal mode
  // This makes components use terminal's default background
  return undefined
}
