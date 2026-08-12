import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { members, users } from '../../../../database/schema'

export default eventHandler(async (event) => {
  requirePermission(event, 'links.read')
  const id = getRouterParam(event, 'id') ?? ''
  await assertWorkspaceTarget(event, id)
  return await drizzle(event.context.cloudflare.env.DB).select({
    id: members.id,
    role: members.role,
    createdAt: members.createdAt,
    user: { id: users.id, name: users.name, email: users.email, image: users.image },
  }).from(members).innerJoin(users, eq(members.userId, users.id)).where(eq(members.organizationId, id))
})
