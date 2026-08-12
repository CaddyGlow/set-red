import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminDomainStatusSchema } from '#shared/schemas/admin'
import { domains } from '../../../../database/schema'
import { updateWorkspaceDomain } from '../../../../services/domain'
import { writePlatformAuditLog } from '../../../../utils/audit'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const { status } = await readValidatedBody(event, AdminDomainStatusSchema.parse)
  const [current] = await drizzle(event.context.cloudflare.env.DB).select().from(domains).where(eq(domains.id, id)).limit(1)
  if (!current)
    throw createError({ status: 404, statusText: 'Domain not found' })
  const updated = await updateWorkspaceDomain(event, current.workspaceId, id, { status })
  await writePlatformAuditLog(event, { action: `domain.${status === 'disabled' ? 'disable' : 'enable'}`, targetType: 'domain', targetId: id, metadata: { hostname: current.hostname } }, current.workspaceId)
  return updated
})
