import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { invitations } from '../../../../database/schema'
import { throwWorkspaceWriteConflict, workspaceWritableCondition } from '../../../../utils/workspace-write'

export default eventHandler(async (event) => {
  requireInteractiveUser(event)
  requirePermission(event, 'members.invite')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  const invitationId = getRouterParam(event, 'invitationId') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  const [invitation] = await drizzle(event.context.cloudflare.env.DB).select().from(invitations).where(and(
    eq(invitations.id, invitationId),
    eq(invitations.organizationId, workspaceId),
  )).limit(1)
  if (!invitation)
    throw createError({ status: 404, statusText: 'Invitation not found' })
  const db = drizzle(event.context.cloudflare.env.DB)
  const [canceled] = await db.update(invitations).set({ status: 'canceled' }).where(and(
    eq(invitations.id, invitationId),
    workspaceWritableCondition(db, workspaceId),
  )).returning({ id: invitations.id })
  if (!canceled)
    await throwWorkspaceWriteConflict(db, workspaceId, 'Invitation cancellation conflict')
  await writeAuditLog(event, { action: 'invitation.cancel', targetType: 'invitation', targetId: invitationId })
  return { success: true }
})
