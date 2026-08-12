import { UpdateDomainSchema } from '#shared/schemas/domain'
import { updateWorkspaceDomain } from '../../services/domain'

export default eventHandler(async (event) => {
  requirePermission(event, 'domains.write')
  const workspaceId = event.context.auth?.workspaceId
  if (!workspaceId)
    throw createError({ status: 403, statusText: 'An active workspace is required' })
  const body = await readValidatedBody(event, UpdateDomainSchema.parse)
  if (body.id !== getRouterParam(event, 'id'))
    throw createError({ status: 400, statusText: 'Domain ID mismatch' })
  const { id, ...updates } = body
  const updated = await updateWorkspaceDomain(event, workspaceId, id, updates)
  await writeAuditLog(event, { action: 'domain.update', targetType: 'domain', targetId: id })
  return updated
})
