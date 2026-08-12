import { deleteDomain } from '../../services/domain'

export default eventHandler(async (event) => {
  if (!event.context.auth?.isInstanceAdmin)
    throw createError({ status: 403, statusText: 'Instance administrator access is required' })
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'Domain ID is required' })
  const domain = await deleteDomain(event, id)
  await writePlatformAuditLog(event, { action: 'domain.delete', targetType: 'domain', targetId: id }, domain.workspaceId)
  return { success: true }
})
