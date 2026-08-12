import { getWorkspaceSettings } from '../../services/workspace-settings'

export default eventHandler(async (event) => {
  const auth = requirePermission(event, 'links.read')
  if (auth.method === 'access-service')
    throw createError({ status: 403, statusText: 'Access service identities cannot read workspace settings' })
  const workspaceId = requireWorkspace(event)
  return getWorkspaceSettings(event, workspaceId)
})
