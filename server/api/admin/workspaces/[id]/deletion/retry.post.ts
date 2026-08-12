import { processWorkspaceDeletion } from '../../../../../services/workspace-deletion'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  return { state: await processWorkspaceDeletion(event.context.cloudflare.env, id) }
})
