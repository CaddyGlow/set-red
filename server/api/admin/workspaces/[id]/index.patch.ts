import { and, eq, ne, notExists } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminWorkspaceUpdateSchema } from '#shared/schemas/admin'
import { organizations, workspaceDeletionJobs } from '../../../../database/schema'
import { writePlatformAuditLog } from '../../../../utils/audit'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBody(event, AdminWorkspaceUpdateSchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  if (input.slug) {
    const [conflict] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.slug, input.slug), ne(organizations.id, id))).limit(1)
    if (conflict)
      throw createError({ status: 409, statusText: 'Workspace slug already exists' })
  }
  const [updated] = await db.update(organizations).set(input).where(and(
    eq(organizations.id, id),
    notExists(db.select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, id))),
  )).returning()
  if (!updated) {
    const [deletion] = await db.select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, id)).limit(1)
    if (deletion)
      throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
    throw createError({ status: 404, statusText: 'Workspace not found' })
  }
  await writePlatformAuditLog(event, { action: 'platform.workspace.update', targetType: 'workspace', targetId: id, metadata: { fields: Object.keys(input) } }, id)
  return updated
})
