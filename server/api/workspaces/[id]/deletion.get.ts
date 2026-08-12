import { getWorkspaceDeletionStatus } from '../../../services/workspace-deletion'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.delete')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  const status = await getWorkspaceDeletionStatus(event.context.cloudflare.env, id)
  if (!status)
    throw createError({ status: 404, statusText: 'Deletion job not found' })
  return status
})
