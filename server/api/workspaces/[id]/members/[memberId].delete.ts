import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isRole } from '#shared/auth/permissions'
import { members } from '../../../../database/schema'

export default eventHandler(async (event) => {
  const auth = requireUserSession(event)
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
  await writeAuditLog(event, { action: 'member.remove', targetType: 'member', targetId: memberId, metadata: { userId: current.userId, role: current.role } })
  await db.delete(members).where(eq(members.id, memberId))
  return { success: true }
})
