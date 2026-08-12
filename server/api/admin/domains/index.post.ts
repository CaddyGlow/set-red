import { AdminDomainCreateSchema } from '#shared/schemas/admin'
import { createDomain } from '../../../services/domain'
import { writePlatformAuditLog } from '../../../utils/audit'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const input = await readValidatedBody(event, AdminDomainCreateSchema.parse)
  const created = await createDomain(event, input)
  await writePlatformAuditLog(event, { action: 'domain.create', targetType: 'domain', targetId: created.id, metadata: { hostname: created.hostname, workspaceId: created.workspaceId } }, created.workspaceId)
  setResponseStatus(event, 201)
  return created
})
