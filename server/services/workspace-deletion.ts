import type { H3Event } from 'h3'
import { and, count, eq, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { auditLogs, domains, links, organizations, workspaceDeletionJobs } from '../database/schema'
import { requireInstanceAdmin, requireInteractiveUser, requirePermission } from '../utils/auth-context'
import { WORKSPACE_WRITE_MAX_DURATION_MS } from '../utils/workspace-write'

const STORAGE_DRAIN_MS = 60_000
const R2_DELETE_PAGE_SIZE = 100

if (STORAGE_DRAIN_MS <= WORKSPACE_WRITE_MAX_DURATION_MS)
  throw new Error('Workspace deletion storage drain must exceed the maximum storage write duration')

export async function requestWorkspaceDeletion(event: H3Event, workspaceId: string, confirmation: string, platformOperation = false) {
  const auth = platformOperation ? requireInstanceAdmin(event) : requireInteractiveUser(event)
  if (!platformOperation)
    requirePermission(event, 'workspace.delete')
  const db = drizzle(event.context.cloudflare.env.DB)
  const [workspace] = await db.select({ id: organizations.id, slug: organizations.slug }).from(organizations).where(eq(organizations.id, workspaceId)).limit(1)
  if (!workspace)
    throw createError({ status: 404, statusText: 'Workspace not found' })
  if (confirmation !== workspace.slug)
    throw createError({ status: 400, statusText: 'Workspace confirmation does not match' })
  const [existing] = await db.select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)).limit(1)
  if (existing)
    return existing
  const [activeDomains, linkedDomains] = await Promise.all([
    db.select({ count: count() }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.status, 'active'))),
    db.select({ count: count() }).from(links).where(eq(links.workspaceId, workspaceId)),
  ])
  if ((activeDomains[0]?.count ?? 0) > 0)
    throw createError({ status: 409, statusText: 'Remove or reassign active domains before deleting the workspace' })
  if ((linkedDomains[0]?.count ?? 0) > 0)
    throw createError({ status: 409, statusText: 'A workspace with links cannot be deleted' })
  const now = new Date()
  const job = {
    workspaceId,
    requestedByType: auth.method === 'access-service' ? 'access-service' as const : 'user' as const,
    requestedById: auth.user?.id ?? auth.method,
    workspaceSlug: workspace.slug,
    state: 'pending' as const,
    storageDrainUntil: new Date(now.getTime() + STORAGE_DRAIN_MS),
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.batch([
    db.insert(workspaceDeletionJobs).values(job).onConflictDoNothing(),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      workspaceId,
      workspaceRef: workspaceId,
      actorType: job.requestedByType,
      actorId: job.requestedById,
      action: 'workspace.delete.request',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { slug: workspace.slug },
      createdAt: Math.floor(now.getTime() / 1000),
    }),
  ])
  return job
}

async function purgePrefix(bucket: R2Bucket, prefix: string): Promise<boolean> {
  const listed = await bucket.list({ prefix, limit: R2_DELETE_PAGE_SIZE })
  if (listed.objects.length)
    await bucket.delete(listed.objects.map(object => object.key))
  return listed.objects.length === 0
}

export async function processWorkspaceDeletion(env: Cloudflare.Env, workspaceId: string): Promise<'pending' | 'purging' | 'complete'> {
  const db = drizzle(env.DB)
  const [job] = await db.select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)).limit(1)
  if (!job)
    return 'complete'
  if (job.storageDrainUntil.getTime() > Date.now())
    return 'pending'
  await db.update(workspaceDeletionJobs).set({ state: 'purging', updatedAt: new Date(), lastErrorCode: null }).where(eq(workspaceDeletionJobs.workspaceId, workspaceId))
  try {
    const bucket = env.R2
    const uploadsEmpty = await purgePrefix(bucket, `uploads/${workspaceId}/`)
    const backupsEmpty = await purgePrefix(bucket, `backups/${workspaceId}/`)
    if (!uploadsEmpty || !backupsEmpty)
      return 'purging'
    const [activeDomainCount, linkCount] = await Promise.all([
      db.select({ count: count() }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.status, 'active'))),
      db.select({ count: count() }).from(links).where(eq(links.workspaceId, workspaceId)),
    ])
    if ((activeDomainCount[0]?.count ?? 0) > 0 || (linkCount[0]?.count ?? 0) > 0) {
      await db.update(workspaceDeletionJobs).set({ lastErrorCode: 'dependencies-remain', updatedAt: new Date() }).where(eq(workspaceDeletionJobs.workspaceId, workspaceId))
      return 'purging'
    }
    const now = Math.floor(Date.now() / 1000)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
        VALUES (?, ?, ?, 'system', 'workspace-deletion', 'workspace.delete.complete', 'workspace', ?, ?, ?)`).bind(crypto.randomUUID(), workspaceId, workspaceId, workspaceId, JSON.stringify({ slug: job.workspaceSlug }), now),
      env.DB.prepare('DELETE FROM organization WHERE id = ?').bind(workspaceId),
    ])
    return 'complete'
  }
  catch (error) {
    const code = error instanceof Error ? error.name.slice(0, 64) : 'unknown'
    await db.update(workspaceDeletionJobs).set({ lastErrorCode: code, updatedAt: new Date() }).where(eq(workspaceDeletionJobs.workspaceId, workspaceId))
    return 'purging'
  }
}

export async function processDueWorkspaceDeletions(env: Cloudflare.Env): Promise<void> {
  const jobs = await drizzle(env.DB).select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(lte(workspaceDeletionJobs.storageDrainUntil, new Date())).limit(25)
  for (const job of jobs)
    await processWorkspaceDeletion(env, job.workspaceId)
}
