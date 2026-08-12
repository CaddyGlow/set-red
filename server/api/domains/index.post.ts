import { CreateDomainSchema } from '#shared/schemas/domain'
import { createDomain } from '../../services/domain'

export default eventHandler(async (event) => {
  if (!event.context.auth?.isInstanceAdmin)
    throw createError({ status: 403, statusText: 'Instance administrator access is required' })
  const domain = await readValidatedBody(event, CreateDomainSchema.parse)
  const created = await createDomain(event, domain)
  await writePlatformAuditLog(event, { action: 'domain.create', targetType: 'domain', targetId: created.id, metadata: { hostname: created.hostname } }, created.workspaceId)
  return created
})
