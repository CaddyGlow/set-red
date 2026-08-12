import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { organizations } from '../../database/schema'

export default eventHandler(async (event) => {
  requireUserSession(event)
  requirePermission(event, 'workspace.delete')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  await writeAuditLog(event, { action: 'workspace.delete', targetType: 'workspace', targetId: id })
  const [deleted] = await drizzle(event.context.cloudflare.env.DB).delete(organizations).where(eq(organizations.id, id)).returning({ id: organizations.id })
  if (!deleted)
    throw createError({ status: 404, statusText: 'Workspace not found' })
  return { success: true }
})
