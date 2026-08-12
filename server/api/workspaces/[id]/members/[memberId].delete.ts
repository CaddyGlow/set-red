import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isRole } from '#shared/auth/permissions'
import { members } from '../../../../database/schema'
import { throwWorkspaceWriteConflict, workspaceWritableCondition } from '../../../../utils/workspace-write'

export default eventHandler(async (event) => {
  const auth = requireInteractiveUser(event)
  requirePermission(event, 'members.remove')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  const memberId = getRouterParam(event, 'memberId') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  const db = drizzle(event.context.cloudflare.env.DB)
  const [current] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.organizationId, workspaceId))).limit(1)
  if (!current || !isRole(current.role))
    throw createError({ status: 404, statusText: 'Member not found' })
  assertRoleMutation(auth.role, current.role)
  if (current.role === 'owner' && await countWorkspaceOwners(event, workspaceId) <= 1)
    throw createError({ status: 409, statusText: 'A workspace must retain an owner' })
  const [deleted] = await db.delete(members).where(and(
    eq(members.id, memberId),
    workspaceWritableCondition(db, workspaceId),
    current.role === 'owner'
      ? sql`exists (select 1 from member as other_owner where other_owner.organization_id = ${workspaceId} and other_owner.role = 'owner' and other_owner.id <> ${memberId})`
      : undefined,
  )).returning({ id: members.id })
  if (!deleted) {
    if (current.role === 'owner' && await countWorkspaceOwners(event, workspaceId) <= 1)
      throw createError({ status: 409, statusText: 'A workspace must retain an owner' })
    await throwWorkspaceWriteConflict(db, workspaceId, 'Member removal conflict')
  }
  await writeAuditLog(event, { action: 'member.remove', targetType: 'member', targetId: memberId, metadata: { userId: current.userId, role: current.role } })
  return { success: true }
})
