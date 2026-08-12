import { AdminDomainAssignmentSchema } from '#shared/schemas/admin'
import { assignDomainWorkspace } from '../../../../services/domain'
import { writePlatformAuditLog } from '../../../../utils/audit'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const { workspaceId } = await readValidatedBody(event, AdminDomainAssignmentSchema.parse)
  const domain = await assignDomainWorkspace(event, id, workspaceId)
  await writePlatformAuditLog(event, { action: 'domain.assign', targetType: 'domain', targetId: id, metadata: { workspaceId } }, workspaceId)
  return domain
})
