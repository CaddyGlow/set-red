import { count, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { apiKeys, domains, invitations, links, organizations, users } from '../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const db = drizzle(event.context.cloudflare.env.DB)
  const scalar = async (query: PromiseLike<Array<{ count: number }>>) => Number((await query)[0]?.count ?? 0)
  const [userCount, verifiedUsers, instanceAdmins, workspaceCount, activeDomains, disabledDomains, linkCount, pendingInvitations, userApiKeys, serviceApiKeys] = await Promise.all([
    scalar(db.select({ count: count() }).from(users)),
    scalar(db.select({ count: count() }).from(users).where(eq(users.emailVerified, true))),
    scalar(db.select({ count: count() }).from(users).where(eq(users.isInstanceAdmin, true))),
    scalar(db.select({ count: count() }).from(organizations)),
    scalar(db.select({ count: count() }).from(domains).where(eq(domains.status, 'active'))),
    scalar(db.select({ count: count() }).from(domains).where(eq(domains.status, 'disabled'))),
    scalar(db.select({ count: count() }).from(links)),
    scalar(db.select({ count: count() }).from(invitations).where(eq(invitations.status, 'pending'))),
    scalar(db.select({ count: count() }).from(apiKeys).where(sql`coalesce(json_extract(${apiKeys.metadata}, '$.independentService'), 0) != 1`)),
    scalar(db.select({ count: count() }).from(apiKeys).where(sql`json_extract(${apiKeys.metadata}, '$.independentService') = 1`)),
  ])
  return { users: userCount, verifiedUsers, instanceAdmins, workspaces: workspaceCount, activeDomains, disabledDomains, links: linkCount, pendingInvitations, userApiKeys, serviceApiKeys }
})
