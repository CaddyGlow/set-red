import type { Permission } from '#shared/auth/permissions'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isPermission, isRole, permissionsForRole } from '#shared/auth/permissions'
import { accounts, apiKeys, members, users } from '../database/schema'
import { ensureAccessWorkspace } from '../services/access-workspace'

function flattenPermissionGrant(grant: unknown): Permission[] {
  if (!grant || typeof grant !== 'object')
    return []
  const permissions: Permission[] = []
  for (const [resource, actions] of Object.entries(grant)) {
    if (!Array.isArray(actions))
      continue
    for (const action of actions) {
      const permission = `${resource}.${action}`
      if (isPermission(permission))
        permissions.push(permission)
    }
  }
  return permissions
}

export default eventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  const blockedDirectMutations = new Set([
    '/api/auth/api-key/create',
    '/api/auth/api-key/update',
    '/api/auth/api-key/delete',
    '/api/auth/api-key/delete-all-expired-api-keys',
    '/api/auth/organization/create',
    '/api/auth/organization/update',
    '/api/auth/organization/delete',
    '/api/auth/organization/invite-member',
    '/api/auth/organization/cancel-invitation',
    '/api/auth/organization/remove-member',
    '/api/auth/organization/update-member-role',
  ])
  if (event.method !== 'GET' && blockedDirectMutations.has(pathname))
    throw createError({ status: 403, statusText: 'Use the authorized workspace endpoint' })
  if (event.method === 'POST' && pathname === '/api/auth/sign-up/email' && !useRuntimeConfig(event).authPublicSignupEnabled)
    throw createError({ status: 403, statusText: 'Public registration is disabled' })
  if (!pathname.startsWith('/api/') || pathname.startsWith('/api/auth/') || pathname === '/api/bootstrap')
    return

  const auth = useBetterAuth(event)
  const authorization = getHeader(event, 'authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined
  if (bearer) {
    const result = await auth.api.verifyApiKey({ body: { configId: 'workspace', key: bearer } })
    if (result.valid && result.key) {
      const rawMetadata = result.key.metadata
      const metadata = typeof rawMetadata === 'string'
        ? JSON.parse(rawMetadata) as Record<string, unknown>
        : (rawMetadata ?? {}) as Record<string, unknown>
      let permissions = flattenPermissionGrant(result.key.permissions)
      if (metadata.independentService !== true) {
        const creatorUserId = typeof metadata.creatorUserId === 'string' ? metadata.creatorUserId : ''
        const [membership] = await drizzle(event.context.cloudflare.env.DB).select().from(members).where(and(
          eq(members.organizationId, result.key.referenceId),
          eq(members.userId, creatorUserId),
        )).limit(1)
        if (!membership || !isRole(membership.role)) {
          await drizzle(event.context.cloudflare.env.DB).update(apiKeys).set({ enabled: false }).where(eq(apiKeys.id, result.key.id))
          throw createError({ status: 401, statusText: 'API key owner is no longer a workspace member' })
        }
        const currentPermissions = new Set(permissionsForRole(membership.role))
        permissions = permissions.filter(permission => currentPermissions.has(permission))
      }
      event.context.auth = {
        method: 'api-key',
        user: null,
        workspaceId: result.key.referenceId,
        role: null,
        permissions,
        apiKeyId: result.key.id,
        isInstanceAdmin: false,
      }
      return
    }
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const session = await auth.api.getSession({ headers: new Headers(getHeaders(event) as HeadersInit) })
  if (session) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method) && !isCloudflareAccessRequestAllowed(event))
      throw createError({ status: 403, statusText: 'Forbidden' })
    const user = session.user as typeof session.user & { isInstanceAdmin?: boolean }
    const authSession = session.session as typeof session.session & { activeOrganizationId?: string | null }
    event.context.auth = {
      method: 'session',
      user: { id: user.id, email: user.email, name: user.name },
      workspaceId: authSession.activeOrganizationId ?? null,
      role: null,
      permissions: [],
      apiKeyId: null,
      isInstanceAdmin: user.isInstanceAdmin === true,
    }
    return
  }

  const accessIdentity = await verifyCloudflareAccess(event)
  if (accessIdentity?.kind === 'service') {
    const expectedIdentity = String(useRuntimeConfig(event).authAccessServiceIdentity).trim()
    if (!expectedIdentity || accessIdentity.commonName !== expectedIdentity)
      throw createError({ status: 403, statusText: 'Forbidden' })
    event.context.auth = {
      method: 'access-service',
      user: null,
      workspaceId: null,
      role: null,
      permissions: [],
      apiKeyId: null,
      isInstanceAdmin: true,
    }
    return
  }

  if (accessIdentity?.kind === 'user') {
    if (!isCloudflareAccessRequestAllowed(event))
      throw createError({ status: 403, statusText: 'Forbidden' })
    const db = drizzle(event.context.cloudflare.env.DB)
    const issuer = String(useRuntimeConfig(event).cfAccessTeamDomain).trim().replace(/\/+$/, '')
    let [identity] = await db.select({ user: users }).from(accounts).innerJoin(users, eq(accounts.userId, users.id)).where(and(
      eq(accounts.providerId, `cloudflare-access:${issuer}`),
      eq(accounts.accountId, accessIdentity.userID),
    )).limit(1)
    if (!identity) {
      const normalizedEmail = accessIdentity.userEmail.toLowerCase()
      const [emailOwner] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1)
      if (emailOwner)
        throw createError({ status: 409, statusText: 'Link Cloudflare Access from the existing account first' })
      const userId = crypto.randomUUID()
      const now = new Date()
      const [createdUser] = await db.insert(users).values({
        id: userId,
        email: normalizedEmail,
        emailVerified: true,
        name: normalizedEmail.split('@')[0] || 'User',
        createdAt: now,
        updatedAt: now,
        isInstanceAdmin: false,
      }).returning()
      await db.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: accessIdentity.userID,
        providerId: `cloudflare-access:${issuer}`,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      identity = createdUser ? { user: createdUser } : undefined
    }
    if (!identity || identity.user.email.toLowerCase() !== accessIdentity.userEmail.toLowerCase())
      throw createError({ status: 403, statusText: 'Cloudflare Access identity is not linked' })
    const workspace = await ensureAccessWorkspace(event, identity.user)
    event.context.auth = {
      method: 'access-user',
      user: { id: identity.user.id, email: identity.user.email, name: identity.user.name },
      workspaceId: workspace.workspaceId,
      role: workspace.role,
      permissions: permissionsForRole(workspace.role),
      apiKeyId: null,
      isInstanceAdmin: identity.user.isInstanceAdmin,
    }
    return
  }

  throw createError({ status: 401, statusText: 'Unauthorized' })
})
