import { WorkspaceSettingsUpdateSchema } from '#shared/schemas/workspace'
import { updateWorkspaceSettings } from '../../services/workspace-settings'

export default eventHandler(async (event) => {
  const auth = requirePermission(event, 'workspace.settings')
  if (auth.method === 'access-service')
    throw createError({ status: 403, statusText: 'Access service identities cannot update workspace settings' })
  const workspaceId = requireWorkspace(event)
  const input = await readValidatedBody(event, WorkspaceSettingsUpdateSchema.parse)
  return updateWorkspaceSettings(event, workspaceId, input)
})
