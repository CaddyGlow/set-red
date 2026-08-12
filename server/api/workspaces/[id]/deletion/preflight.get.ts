import { getWorkspaceDeletionPreflight } from '../../../../services/workspace-deletion'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'workspace.delete')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  return await getWorkspaceDeletionPreflight(event.context.cloudflare.env, id)
})
