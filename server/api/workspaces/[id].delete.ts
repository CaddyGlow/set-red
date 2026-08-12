import { AdminWorkspaceDeleteSchema } from '#shared/schemas/admin'
import { getWorkspaceDeletionStatus, requestWorkspaceDeletion } from '../../services/workspace-deletion'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.delete')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  const { confirmation } = await readValidatedBody(event, AdminWorkspaceDeleteSchema.parse)
  await requestWorkspaceDeletion(event, id, confirmation)
  setResponseStatus(event, 202)
  return await getWorkspaceDeletionStatus(event.context.cloudflare.env, id)
})
