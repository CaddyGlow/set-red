import type { AdminWorkspaceSummary } from '#shared/types/admin'
import { and, desc, eq, like, lt, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminListQuerySchema } from '#shared/schemas/admin'
import { organizations } from '../../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const query = AdminListQuerySchema.parse(getQuery(event))
  const cursor = decodeAdminCursor(query.cursor)
  const rows = await drizzle(event.context.cloudflare.env.DB).select({
    id: organizations.id,
    name: organizations.name,
    slug: organizations.slug,
    createdAt: organizations.createdAt,
    memberCount: sql<number>`(select count(*) from member where organization_id = ${organizations.id})`,
    ownerCount: sql<number>`(select count(*) from member where organization_id = ${organizations.id} and role = 'owner')`,
    domainCount: sql<number>`(select count(*) from domains where workspace_id = ${organizations.id})`,
    linkCount: sql<number>`(select count(*) from links where workspace_id = ${organizations.id})`,
    apiKeyCount: sql<number>`(select count(*) from apikey where reference_id = ${organizations.id})`,
    deletionState: sql<'pending' | 'purging' | null>`(select state from workspace_deletion_jobs where workspace_id = ${organizations.id})`,
  }).from(organizations).where(and(
    query.q ? or(like(organizations.name, `%${query.q}%`), like(organizations.slug, `%${query.q}%`)) : undefined,
    cursor ? or(lt(organizations.createdAt, new Date(cursor.createdAt * 1000)), and(eq(organizations.createdAt, new Date(cursor.createdAt * 1000)), lt(organizations.id, cursor.id))) : undefined,
  )).orderBy(desc(organizations.createdAt), desc(organizations.id)).limit(query.limit + 1)
  const page = rows.slice(0, query.limit)
  const items: AdminWorkspaceSummary[] = page.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), memberCount: Number(row.memberCount), ownerCount: Number(row.ownerCount), domainCount: Number(row.domainCount), linkCount: Number(row.linkCount), apiKeyCount: Number(row.apiKeyCount) }))
  const last = page.at(-1)
  return { items, nextCursor: rows.length > query.limit && last ? encodeAdminCursor({ createdAt: Math.floor(last.createdAt.getTime() / 1000), id: last.id }) : null }
})
