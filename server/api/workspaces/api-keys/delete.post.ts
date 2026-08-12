import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { DeleteWorkspaceApiKeySchema } from '#shared/schemas/api-key'
import { apiKeys } from '../../../database/schema'
import { throwWorkspaceWriteConflict, workspaceWritableCondition } from '../../../utils/workspace-write'

export default eventHandler(async (event) => {
  const auth = requireAuth(event)
  const workspaceId = requireWorkspace(event)
  const { id } = await readValidatedBody(event, DeleteWorkspaceApiKeySchema.parse)
  const [key] = await drizzle(event.context.cloudflare.env.DB).select().from(apiKeys).where(and(
    eq(apiKeys.id, id),
    eq(apiKeys.referenceId, workspaceId),
  )).limit(1)
  if (!key)
    throw createError({ status: 404, statusText: 'API key not found' })
  const metadata = typeof key.metadata === 'string' ? JSON.parse(key.metadata) as Record<string, unknown> : key.metadata
  if (!auth.permissions.includes('apiKeys.manage') && metadata?.creatorUserId !== auth.user?.id)
    throw createError({ status: 403, statusText: 'Forbidden' })
  const db = drizzle(event.context.cloudflare.env.DB)
  const [deleted] = await db.delete(apiKeys).where(and(
    eq(apiKeys.id, id),
    workspaceWritableCondition(db, workspaceId),
  )).returning({ id: apiKeys.id })
  if (!deleted)
    await throwWorkspaceWriteConflict(db, workspaceId, 'API key revocation conflict')
  await writeAuditLog(event, { action: 'api-key.revoke', targetType: 'api-key', targetId: id })
  return { success: true }
})
