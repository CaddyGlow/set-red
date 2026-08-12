import { and, eq, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminWorkspaceUpdateSchema } from '#shared/schemas/admin'
import { organizations } from '../../../../database/schema'
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
  const [updated] = await db.update(organizations).set(input).where(eq(organizations.id, id)).returning()
  if (!updated)
    throw createError({ status: 404, statusText: 'Workspace not found' })
  await writePlatformAuditLog(event, { action: 'platform.workspace.update', targetType: 'workspace', targetId: id, metadata: { fields: Object.keys(input) } }, id)
  return updated
})
