export function getAPIErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null)
    return fallback

  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    statusMessage?: unknown
    data?: { statusMessage?: unknown, message?: unknown }
    message?: unknown
  }
  if (typeof candidate.data?.statusMessage === 'string')
    return candidate.data.statusMessage
  if (typeof candidate.data?.message === 'string')
    return candidate.data.message
  if (typeof candidate.statusMessage === 'string')
    return candidate.statusMessage
  if (typeof candidate.message === 'string')
    return candidate.message
  return fallback
}

export function getAPIStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null)
    return undefined
  const candidate = error as { status?: unknown, statusCode?: unknown }
  if (typeof candidate.status === 'number')
    return candidate.status
  return typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined
}
