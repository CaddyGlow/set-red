import { WorkspaceOwnershipTransferSchema } from '#shared/schemas/workspace'
import { transferWorkspaceOwnership } from '../../../../services/workspace-lifecycle'

export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const { targetMemberId } = await readValidatedBody(event, WorkspaceOwnershipTransferSchema.parse)
  return await transferWorkspaceOwnership(event, id, targetMemberId)
})
