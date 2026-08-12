export interface AdminCursor {
  v: 1
  createdAt: number
  id: string
}

export function encodeAdminCursor(cursor: Omit<AdminCursor, 'v'>): string {
  return btoa(JSON.stringify({ v: 1, ...cursor } satisfies AdminCursor))
}

export function decodeAdminCursor(value?: string): AdminCursor | null {
  if (!value)
    return null
  try {
    const cursor = JSON.parse(atob(value)) as Partial<AdminCursor>
    if (cursor.v !== 1 || !Number.isFinite(cursor.createdAt) || typeof cursor.id !== 'string' || !cursor.id)
      throw new Error('Invalid cursor')
    return cursor as AdminCursor
  }
  catch {
    throw createError({ status: 400, statusText: 'Invalid cursor' })
  }
}
