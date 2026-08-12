import { resendWorkspaceInvitation } from '../../../../../services/invitation'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'members.invite')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  const invitationId = getRouterParam(event, 'invitationId') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  const invitation = await resendWorkspaceInvitation(event, workspaceId, invitationId)
  await writeAuditLog(event, { action: 'invitation.resend', targetType: 'invitation', targetId: invitationId })
  return invitation
})
