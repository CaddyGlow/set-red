import { listWorkspaceDomains } from '../../services/domain'

export default eventHandler(async (event) => {
  requirePermission(event, 'links.read')
  const workspaceId = event.context.auth?.workspaceId
  if (!workspaceId)
    throw createError({ status: 403, statusText: 'An active workspace is required' })
  return await listWorkspaceDomains(event, workspaceId)
})
