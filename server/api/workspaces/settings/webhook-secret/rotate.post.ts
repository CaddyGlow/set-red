import { rotateWorkspaceWebhookSecret } from '../../../../services/workspace-settings'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.settings')
  const workspaceId = requireWorkspace(event)
  return rotateWorkspaceWebhookSecret(event, workspaceId)
})
