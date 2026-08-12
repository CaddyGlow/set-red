import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { apiKeys } from '../../../database/schema'

export default eventHandler(async (event) => {
  const auth = requireAuth(event)
  const workspaceId = requireWorkspace(event)
  if (!auth.permissions.includes('apiKeys.own') && !auth.permissions.includes('apiKeys.manage'))
    throw createError({ status: 403, statusText: 'Forbidden' })
  const rows = await drizzle(event.context.cloudflare.env.DB).select({
    id: apiKeys.id,
    name: apiKeys.name,
    start: apiKeys.start,
    enabled: apiKeys.enabled,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
    metadata: apiKeys.metadata,
    permissions: apiKeys.permissions,
  }).from(apiKeys).where(eq(apiKeys.referenceId, workspaceId))
  if (auth.permissions.includes('apiKeys.manage'))
    return rows
  return rows.filter((row) => {
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) as Record<string, unknown> : row.metadata
    return metadata?.creatorUserId === auth.user?.id
  })
})
