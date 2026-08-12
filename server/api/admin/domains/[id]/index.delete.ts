import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { domains } from '../../../../database/schema'
import { deleteDomain } from '../../../../services/domain'
import { writePlatformAuditLog } from '../../../../utils/audit'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const [domain] = await drizzle(event.context.cloudflare.env.DB).select().from(domains).where(eq(domains.id, id)).limit(1)
  if (!domain)
    throw createError({ status: 404, statusText: 'Domain not found' })
  await deleteDomain(event, id)
  await writePlatformAuditLog(event, { action: 'domain.delete', targetType: 'domain', targetId: id, metadata: { hostname: domain.hostname } }, domain.workspaceId)
  return { success: true }
})
