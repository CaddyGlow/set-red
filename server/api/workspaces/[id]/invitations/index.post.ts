import { WorkspaceInvitationSchema } from '#shared/schemas/workspace'

export default eventHandler(async (event) => {
  requireUserSession(event)
  requirePermission(event, 'members.invite')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  const input = await readValidatedBody(event, WorkspaceInvitationSchema.parse)
  const invitation = await useBetterAuth(event).api.createInvitation({
    headers: new Headers(getHeaders(event) as HeadersInit),
    body: { ...input, organizationId: workspaceId },
  })
  await writeAuditLog(event, { action: 'invitation.create', targetType: 'invitation', targetId: invitation.id, metadata: { email: input.email, role: input.role } })
  setResponseStatus(event, 201)
  return invitation
})
