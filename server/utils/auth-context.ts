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

export function requireInteractiveUser(event: H3Event): AuthContext & { user: NonNullable<AuthContext['user']> } {
  const auth = requireAuth(event)
  if (!['session', 'access-user'].includes(auth.method) || !auth.user)
    throw createError({ status: 403, statusText: 'An interactive user is required' })
  return auth as AuthContext & { user: NonNullable<AuthContext['user']> }
}

export function requireSessionUser(event: H3Event): AuthContext & { user: NonNullable<AuthContext['user']> } {
  const auth = requireInteractiveUser(event)
  if (auth.method !== 'session')
    throw createError({ status: 403, statusText: 'A user session is required' })
  return auth
}

/** @deprecated Use requireInteractiveUser or requireSessionUser explicitly. */
export const requireUserSession = requireSessionUser

export function requireInstanceAdmin(event: H3Event): AuthContext {
  const auth = requireAuth(event)
  if (!auth.isInstanceAdmin || !['session', 'access-user', 'access-service'].includes(auth.method))
    throw createError({ status: 403, statusText: 'Instance administrator required' })
  return auth
}

export function requireInstanceAdminUser(event: H3Event): AuthContext & { user: NonNullable<AuthContext['user']> } {
  const auth = requireInteractiveUser(event)
  if (!auth.isInstanceAdmin)
    throw createError({ status: 403, statusText: 'Instance administrator user required' })
  return auth
}

export function requireLinkOwnership(event: H3Event, link: Pick<Link, 'createdBy'>): void {
  const auth = requireAuth(event)
  if (!['session', 'access-user'].includes(auth.method) || auth.role !== 'member')
    return
  if (!auth.user || link.createdBy !== auth.user.id)
    throw createError({ status: 403, statusText: 'Members can only modify their own links' })
}
