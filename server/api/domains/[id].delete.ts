import { deleteDomain } from '../../services/domain'

export default eventHandler(async (event) => {
  if (!event.context.auth?.isInstanceAdmin)
    throw createError({ status: 403, statusText: 'Instance administrator access is required' })
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'Domain ID is required' })
  await deleteDomain(event, id)
  return { success: true }
})
