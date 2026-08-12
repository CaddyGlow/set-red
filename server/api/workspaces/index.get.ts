import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { members, organizations } from '../../database/schema'

export default eventHandler(async (event) => {
  const auth = requireUserSession(event)
  return await drizzle(event.context.cloudflare.env.DB).select({
    id: organizations.id,
    name: organizations.name,
    slug: organizations.slug,
    role: members.role,
  }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id)).where(eq(members.userId, auth.user.id))
})
