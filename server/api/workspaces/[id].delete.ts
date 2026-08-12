import { AdminWorkspaceDeleteSchema } from '#shared/schemas/admin'
import { requestWorkspaceDeletion } from '../../services/workspace-deletion'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.delete')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  const { confirmation } = await readValidatedBody(event, AdminWorkspaceDeleteSchema.parse)
  const job = await requestWorkspaceDeletion(event, id, confirmation)
  setResponseStatus(event, 202)
  return job
})
