import { removeWorkspaceWebhookSecret } from '../../../services/workspace-settings'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.settings')
  const workspaceId = requireWorkspace(event)
  return removeWorkspaceWebhookSecret(event, workspaceId)
})
