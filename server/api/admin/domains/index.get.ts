import type { AdminDomainSummary } from '#shared/types/admin'
import { and, desc, eq, like, lt, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminDomainsQuerySchema } from '#shared/schemas/admin'
import { domains, organizations } from '../../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const query = AdminDomainsQuerySchema.parse(getQuery(event))
  const cursor = decodeAdminCursor(query.cursor)
  const rows = await drizzle(event.context.cloudflare.env.DB).select({
    id: domains.id,
    workspaceId: domains.workspaceId,
    workspaceName: organizations.name,
    hostname: domains.hostname,
    status: domains.status,
    isPrimary: domains.isPrimary,
    createdAt: domains.createdAt,
  }).from(domains).innerJoin(organizations, eq(domains.workspaceId, organizations.id)).where(and(
    query.q ? like(domains.hostname, `%${query.q}%`) : undefined,
    query.status ? eq(domains.status, query.status) : undefined,
    query.workspaceId ? eq(domains.workspaceId, query.workspaceId) : undefined,
    cursor ? or(lt(domains.createdAt, cursor.createdAt), and(eq(domains.createdAt, cursor.createdAt), lt(domains.id, cursor.id))) : undefined,
  )).orderBy(desc(domains.createdAt), desc(domains.id)).limit(query.limit + 1)
  const page = rows.slice(0, query.limit) as AdminDomainSummary[]
  const last = page.at(-1)
  return { items: page, nextCursor: rows.length > query.limit && last ? encodeAdminCursor({ createdAt: last.createdAt, id: last.id }) : null }
})
