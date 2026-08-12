import type { AdminUserSummary } from '#shared/types/admin'
import { and, desc, eq, like, lt, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminUsersQuerySchema } from '#shared/schemas/admin'
import { users } from '../../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const query = AdminUsersQuerySchema.parse(getQuery(event))
  const cursor = decodeAdminCursor(query.cursor)
  const rows = await drizzle(event.context.cloudflare.env.DB).select({
    id: users.id,
    name: users.name,
    email: users.email,
    emailVerified: users.emailVerified,
    isInstanceAdmin: users.isInstanceAdmin,
    createdAt: users.createdAt,
    providers: sql<string>`coalesce((select json_group_array(provider_id) from account where user_id = ${users.id}), '[]')`,
    workspaceCount: sql<number>`(select count(*) from member where user_id = ${users.id})`,
    lastSessionAt: sql<number | null>`(select max(updated_at) from session where user_id = ${users.id})`,
  }).from(users).where(and(
    query.q ? or(like(users.name, `%${query.q}%`), like(users.email, `%${query.q}%`)) : undefined,
    query.admin === undefined ? undefined : eq(users.isInstanceAdmin, query.admin === 'true'),
    cursor ? or(lt(users.createdAt, new Date(cursor.createdAt * 1000)), and(eq(users.createdAt, new Date(cursor.createdAt * 1000)), lt(users.id, cursor.id))) : undefined,
  )).orderBy(desc(users.createdAt), desc(users.id)).limit(query.limit + 1)
  const page = rows.slice(0, query.limit)
  const items: AdminUserSummary[] = page.map(row => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    providers: JSON.parse(row.providers) as string[],
    workspaceCount: Number(row.workspaceCount),
    lastSessionAt: row.lastSessionAt ? new Date(row.lastSessionAt * 1000).toISOString() : null,
  }))
  const last = page.at(-1)
  return { items, nextCursor: rows.length > query.limit && last ? encodeAdminCursor({ createdAt: Math.floor(last.createdAt.getTime() / 1000), id: last.id }) : null }
})
