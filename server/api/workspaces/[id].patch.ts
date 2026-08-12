import { WorkspaceUpdateSchema } from '#shared/schemas/workspace'
import { updateWorkspaceIdentity } from '../../services/workspace-lifecycle'

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBody(event, WorkspaceUpdateSchema.parse)
  return await updateWorkspaceIdentity(event, id, input)
})
