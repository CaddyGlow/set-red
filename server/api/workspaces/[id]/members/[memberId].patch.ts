import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isRole } from '#shared/auth/permissions'
import { WorkspaceMemberRoleSchema } from '#shared/schemas/workspace'
import { members } from '../../../../database/schema'

export default eventHandler(async (event) => {
  const auth = requireInteractiveUser(event)
  requirePermission(event, 'members.change-role')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  const memberId = getRouterParam(event, 'memberId') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  const { role } = await readValidatedBody(event, WorkspaceMemberRoleSchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const [current] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.organizationId, workspaceId))).limit(1)
  if (!current || !isRole(current.role))
    throw createError({ status: 404, statusText: 'Member not found' })
  assertRoleMutation(auth.role, current.role, role)
  if (current.role === 'owner' && role !== 'owner' && await countWorkspaceOwners(event, workspaceId) <= 1)
    throw createError({ status: 409, statusText: 'A workspace must retain an owner' })
  const [updated] = await db.update(members).set({ role }).where(eq(members.id, memberId)).returning()
  await writeAuditLog(event, { action: 'member.role.update', targetType: 'member', targetId: memberId, metadata: { previousRole: current.role, role } })
  return updated
})
