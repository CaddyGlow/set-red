import { drizzle } from 'drizzle-orm/d1'
import { WorkspaceCreateSchema } from '#shared/schemas/workspace'
import { auditLogs, members, organizations, workspaceSettings } from '../../database/schema'

export default eventHandler(async (event) => {
  const auth = requireInteractiveUser(event)
  const input = await readValidatedBody(event, WorkspaceCreateSchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const workspaceId = crypto.randomUUID()
  const now = new Date()
  await db.batch([
    db.insert(organizations).values({ id: workspaceId, ...input, createdAt: now }),
    db.insert(members).values({ id: crypto.randomUUID(), organizationId: workspaceId, userId: auth.user.id, role: 'owner', createdAt: now }),
    db.insert(workspaceSettings).values({ workspaceId }),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      workspaceId,
      workspaceRef: workspaceId,
      actorType: 'user',
      actorId: auth.user.id,
      action: 'workspace.create',
      targetType: 'workspace',
      targetId: workspaceId,
      createdAt: Math.floor(now.getTime() / 1000),
    }),
  ])
  setResponseStatus(event, 201)
  return { id: workspaceId, ...input, role: 'owner' as const }
})
