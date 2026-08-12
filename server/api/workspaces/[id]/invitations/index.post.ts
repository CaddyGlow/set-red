import { WorkspaceInvitationSchema } from '#shared/schemas/workspace'
import { createWorkspaceInvitation } from '../../../../services/invitation'

export default eventHandler(async (event) => {
  const auth = requireInteractiveUser(event)
  requirePermission(event, 'members.invite')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  const input = await readValidatedBody(event, WorkspaceInvitationSchema.parse)
  const invitation = await createWorkspaceInvitation(event, workspaceId, auth.user.id, input)
  setResponseStatus(event, 201)
  return invitation
})
