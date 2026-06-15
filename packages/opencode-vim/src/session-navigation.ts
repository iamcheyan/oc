type SessionLike = {
  id: string
  parentID?: string
}

export function getFirstChildSessionID(
  sessions: readonly SessionLike[],
): string | undefined {
  if (sessions.length <= 1) return
  return sessions.find((session) => !!session.parentID)?.id
}

export function getParentSessionID(
  session: SessionLike | undefined,
): string | undefined {
  return session?.parentID
}

export function getSiblingChildSessionID(
  sessions: readonly SessionLike[],
  currentSessionID: string | undefined,
  direction: 1 | -1,
): string | undefined {
  if (sessions.length <= 1) return

  const children = sessions.filter((session) => !!session.parentID)
  if (children.length === 0) return

  let next = children.findIndex((session) => session.id === currentSessionID) + direction
  if (next >= children.length) next = 0
  if (next < 0) next = children.length - 1

  return children[next]?.id
}
