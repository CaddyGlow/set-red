import type { H3Event } from 'h3'
import { drizzle } from 'drizzle-orm/d1'
import { auditLogs } from '../database/schema'

export interface AuditEvent {
  action: string
  targetType: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditLog(event: H3Event, entry: AuditEvent): Promise<void> {
  const auth = requireAuth(event)
  await drizzle(event.context.cloudflare.env.DB).insert(auditLogs).values({
    id: crypto.randomUUID(),
    workspaceId: auth.workspaceId,
    actorType: auth.method === 'api-key' ? 'api-key' : auth.method === 'access-service' ? 'access-service' : 'user',
    actorId: auth.apiKeyId ?? auth.user?.id ?? auth.method,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    createdAt: Math.floor(Date.now() / 1000),
  })
}
