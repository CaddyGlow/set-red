import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { WorkspaceUpdateSchema } from '#shared/schemas/workspace'
import { organizations } from '../../database/schema'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.settings')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  const input = await readValidatedBody(event, WorkspaceUpdateSchema.parse)
  const [workspace] = await drizzle(event.context.cloudflare.env.DB).update(organizations).set(input).where(and(
    eq(organizations.id, id),
  )).returning()
  if (!workspace)
    throw createError({ status: 404, statusText: 'Workspace not found' })
  await writeAuditLog(event, { action: 'workspace.update', targetType: 'workspace', targetId: id, metadata: { fields: Object.keys(input) } })
  return workspace
})
