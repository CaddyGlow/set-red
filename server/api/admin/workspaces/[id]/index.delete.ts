import { AdminWorkspaceDeleteSchema } from '#shared/schemas/admin'
import { requestWorkspaceDeletion } from '../../../../services/workspace-deletion'

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const { confirmation } = await readValidatedBody(event, AdminWorkspaceDeleteSchema.parse)
  const job = await requestWorkspaceDeletion(event, id, confirmation, true)
  setResponseStatus(event, 202)
  return job
})
