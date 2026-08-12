import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { invitations } from '../../../../database/schema'

export default eventHandler(async (event) => {
  requireUserSession(event)
  requirePermission(event, 'members.invite')
  const workspaceId = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, workspaceId)
  return await drizzle(event.context.cloudflare.env.DB).select().from(invitations).where(eq(invitations.organizationId, workspaceId))
})
