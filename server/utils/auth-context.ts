import type { H3Event } from 'h3'
import type { Permission } from '#shared/auth/permissions'
import type { Link } from '#shared/schemas/link'
import type { AuthContext } from '#shared/types/auth'
import { createError } from 'h3'

export function requireAuth(event: H3Event): AuthContext {
  const auth = event.context.auth
  if (!auth)
    throw createError({ status: 401, statusText: 'Unauthorized' })
  return auth
}

export function requireWorkspace(event: H3Event): string {
  const { workspaceId } = requireAuth(event)
  if (!workspaceId)
    throw createError({ status: 400, statusText: 'No active workspace' })
  return workspaceId
}

export function requirePermission(event: H3Event, permission: Permission): AuthContext {
  const auth = requireAuth(event)
  if (!auth.permissions.includes(permission))
    throw createError({ status: 403, statusText: 'Forbidden' })
  return auth
}

export function requireUserSession(event: H3Event): AuthContext & { user: NonNullable<AuthContext['user']> } {
  const auth = requireAuth(event)
  if (auth.method !== 'session' || !auth.user)
    throw createError({ status: 403, statusText: 'A user session is required' })
  return auth as AuthContext & { user: NonNullable<AuthContext['user']> }
}

export function requireLinkOwnership(event: H3Event, link: Pick<Link, 'createdBy'>): void {
  const auth = requireAuth(event)
  if (auth.method !== 'session' || auth.role !== 'member')
    return
  if (!auth.user || link.createdBy !== auth.user.id)
    throw createError({ status: 403, statusText: 'Members can only modify their own links' })
}
