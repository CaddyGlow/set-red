import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { apiKeys, auditLogs, domains, members, organizations, users, workspaceDeletionJobs, workspaceSettings } from '../../../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const db = drizzle(event.context.cloudflare.env.DB)
  const [workspace] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1)
  if (!workspace)
    throw createError({ status: 404, statusText: 'Workspace not found' })
  const [settingsRows, memberRows, domainRows, keyRows, auditRows, deletionRows] = await Promise.all([
    db.select({ defaultSlugLength: workspaceSettings.defaultSlugLength, caseSensitive: workspaceSettings.caseSensitive, redirectStatusCode: workspaceSettings.redirectStatusCode, webhookUrl: workspaceSettings.webhookUrl }).from(workspaceSettings).where(eq(workspaceSettings.workspaceId, id)),
    db.select({ id: members.id, role: members.role, createdAt: members.createdAt, user: { id: users.id, name: users.name, email: users.email } }).from(members).innerJoin(users, eq(members.userId, users.id)).where(eq(members.organizationId, id)),
    db.select().from(domains).where(eq(domains.workspaceId, id)),
    db.select({ id: apiKeys.id, name: apiKeys.name, enabled: apiKeys.enabled, createdAt: apiKeys.createdAt }).from(apiKeys).where(eq(apiKeys.referenceId, id)),
    db.select().from(auditLogs).where(eq(auditLogs.workspaceRef, id)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(25),
    db.select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, id)).limit(1),
  ])
  return { workspace, settings: settingsRows[0] ?? null, members: memberRows, domains: domainRows, apiKeys: keyRows, recentAudit: auditRows, deletion: deletionRows[0] ?? null }
})
