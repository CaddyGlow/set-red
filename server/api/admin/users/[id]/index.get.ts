import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { accounts, members, organizations, sessions, users } from '../../../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const db = drizzle(event.context.cloudflare.env.DB)
  const [user] = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    emailVerified: users.emailVerified,
    image: users.image,
    isInstanceAdmin: users.isInstanceAdmin,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, id)).limit(1)
  if (!user)
    throw createError({ status: 404, statusText: 'User not found' })
  const [providers, workspaces, lastSession] = await Promise.all([
    db.selectDistinct({ providerId: accounts.providerId }).from(accounts).where(eq(accounts.userId, id)),
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role }).from(members).innerJoin(organizations, eq(members.organizationId, organizations.id)).where(eq(members.userId, id)),
    db.select({ updatedAt: sessions.updatedAt }).from(sessions).where(eq(sessions.userId, id)).orderBy(desc(sessions.updatedAt)).limit(1),
  ])
  return { ...user, providers, workspaces, lastSessionAt: lastSession[0]?.updatedAt ?? null }
})
