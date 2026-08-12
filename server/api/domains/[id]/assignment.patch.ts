import { AssignDomainSchema } from '#shared/schemas/domain'
import { assignDomainWorkspace } from '../../../services/domain'

export default eventHandler(async (event) => {
  if (!event.context.auth?.isInstanceAdmin)
    throw createError({ status: 403, statusText: 'Instance administrator access is required' })
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'Domain ID is required' })
  const { workspaceId } = await readValidatedBody(event, AssignDomainSchema.parse)
  return await assignDomainWorkspace(event, id, workspaceId)
})
