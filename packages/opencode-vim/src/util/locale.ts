export * from "../../../opencode/src/util/locale"

export function time(input: number): string {
  const date = new Date(input)
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true })
}

export function datetime(input: number): string {
  const date = new Date(input)
  const localTime = time(input)
  const localDate = date.toLocaleDateString()
  return `${localTime}  ${localDate}`
}