import type { AdminAuditSummary } from '#shared/types/admin'
import { and, desc, eq, gte, lt, lte, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { AdminAuditQuerySchema } from '#shared/schemas/admin'
import { auditLogs } from '../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const query = AdminAuditQuerySchema.parse(getQuery(event))
  const cursor = decodeAdminCursor(query.cursor)
  const rows = await drizzle(event.context.cloudflare.env.DB).select({
    id: auditLogs.id,
    workspaceRef: auditLogs.workspaceRef,
    actorType: auditLogs.actorType,
    actorId: auditLogs.actorId,
    action: auditLogs.action,
    targetType: auditLogs.targetType,
    targetId: auditLogs.targetId,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
  }).from(auditLogs).where(and(
    query.workspaceId ? eq(auditLogs.workspaceRef, query.workspaceId) : undefined,
    query.actorId ? eq(auditLogs.actorId, query.actorId) : undefined,
    query.action ? eq(auditLogs.action, query.action) : undefined,
    query.from !== undefined ? gte(auditLogs.createdAt, query.from) : undefined,
    query.to !== undefined ? lte(auditLogs.createdAt, query.to) : undefined,
    cursor ? or(lt(auditLogs.createdAt, cursor.createdAt), and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, cursor.id))) : undefined,
  )).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(query.limit + 1)
  const page = rows.slice(0, query.limit) as AdminAuditSummary[]
  const last = page.at(-1)
  return { items: page, nextCursor: rows.length > query.limit && last ? encodeAdminCursor({ createdAt: last.createdAt, id: last.id }) : null }
})
