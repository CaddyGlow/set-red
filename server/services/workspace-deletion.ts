import type { H3Event } from 'h3'
import type { WorkspaceDeletionPreflight, WorkspaceDeletionStatus } from '#shared/types/workspace'
import { and, count, eq, lte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { domains, links, organizations, workspaceDeletionJobs } from '../database/schema'
import { requireInstanceAdmin, requireInteractiveUser, requirePermission } from '../utils/auth-context'
import { WORKSPACE_WRITE_MAX_DURATION_MS } from '../utils/workspace-write'

const STORAGE_DRAIN_MS = 60_000
const R2_DELETE_PAGE_SIZE = 100

if (STORAGE_DRAIN_MS <= WORKSPACE_WRITE_MAX_DURATION_MS)
  throw new Error('Workspace deletion storage drain must exceed the maximum storage write duration')

export async function getWorkspaceDeletionPreflight(env: Cloudflare.Env, workspaceId: string): Promise<WorkspaceDeletionPreflight> {
  const db = drizzle(env.DB)
  const [activeDomains, workspaceLinks] = await Promise.all([
    db.select({ count: count() }).from(domains).where(and(eq(domains.workspaceId, workspaceId), eq(domains.status, 'active'))),
    db.select({ count: count() }).from(links).where(eq(links.workspaceId, workspaceId)),
  ])
  const activeDomainCount = activeDomains[0]?.count ?? 0
  const linkCount = workspaceLinks[0]?.count ?? 0
  return { activeDomainCount, linkCount, canDelete: activeDomainCount === 0 && linkCount === 0 }
}

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
  const preflight = await getWorkspaceDeletionPreflight(event.context.cloudflare.env, workspaceId)
  if (preflight.activeDomainCount > 0)
    throw createError({ status: 409, statusText: 'Remove or reassign active domains before deleting the workspace' })
  if (preflight.linkCount > 0)
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
  const nowSeconds = Math.floor(now.getTime() / 1000)
  await event.context.cloudflare.env.DB.batch([
    event.context.cloudflare.env.DB.prepare(`INSERT INTO workspace_deletion_jobs
      (workspace_id, requested_by_type, requested_by_id, workspace_slug, state, storage_drain_until, last_error_code, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'pending', ?, NULL, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM domains WHERE workspace_id = ? AND status = 'active')
        AND NOT EXISTS (SELECT 1 FROM links WHERE workspace_id = ?)
      ON CONFLICT (workspace_id) DO NOTHING`).bind(
      workspaceId,
      job.requestedByType,
      job.requestedById,
      workspace.slug,
      Math.floor(job.storageDrainUntil.getTime() / 1000),
      nowSeconds,
      nowSeconds,
      workspaceId,
      workspaceId,
    ),
    event.context.cloudflare.env.DB.prepare(`INSERT INTO audit_logs
      (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
      SELECT ?, ?, ?, ?, ?, 'workspace.delete.request', 'workspace', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM workspace_deletion_jobs WHERE workspace_id = ?)
        AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE workspace_ref = ? AND action = 'workspace.delete.request' AND target_id = ?)`).bind(
      crypto.randomUUID(),
      workspaceId,
      workspaceId,
      job.requestedByType,
      job.requestedById,
      workspaceId,
      JSON.stringify({ slug: workspace.slug }),
      nowSeconds,
      workspaceId,
      workspaceId,
      workspaceId,
    ),
  ])
  const [created] = await db.select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)).limit(1)
  if (created)
    return created
  const blocked = await getWorkspaceDeletionPreflight(event.context.cloudflare.env, workspaceId)
  if (blocked.activeDomainCount > 0)
    throw createError({ status: 409, statusText: 'Remove or reassign active domains before deleting the workspace' })
  throw createError({ status: 409, statusText: 'A workspace with links cannot be deleted' })
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

function publicDeletionErrorCode(lastErrorCode: string | null): WorkspaceDeletionStatus['errorCode'] {
  if (!lastErrorCode)
    return null
  if (lastErrorCode === 'dependencies-remain')
    return 'dependencies-remain'
  return 'cleanup-failed'
}

export async function getWorkspaceDeletionStatus(env: Cloudflare.Env, workspaceId: string): Promise<WorkspaceDeletionStatus | null> {
  const [job] = await drizzle(env.DB).select({
    state: workspaceDeletionJobs.state,
    storageDrainUntil: workspaceDeletionJobs.storageDrainUntil,
    lastErrorCode: workspaceDeletionJobs.lastErrorCode,
    updatedAt: workspaceDeletionJobs.updatedAt,
  }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)).limit(1)
  if (!job)
    return null
  const errorCode = publicDeletionErrorCode(job.lastErrorCode)
  return {
    state: errorCode ? 'blocked' : job.state,
    errorCode,
    storageDrainUntil: job.storageDrainUntil.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }
}

export async function retryWorkspaceDeletion(env: Cloudflare.Env, workspaceId: string): Promise<WorkspaceDeletionStatus> {
  const state = await processWorkspaceDeletion(env, workspaceId)
  if (state === 'complete')
    return { state, errorCode: null, storageDrainUntil: null, updatedAt: null }
  const status = await getWorkspaceDeletionStatus(env, workspaceId)
  return status ?? { state: 'complete', errorCode: null, storageDrainUntil: null, updatedAt: null }
}

export async function processDueWorkspaceDeletions(env: Cloudflare.Env): Promise<void> {
  const jobs = await drizzle(env.DB).select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(lte(workspaceDeletionJobs.storageDrainUntil, new Date())).limit(25)
  for (const job of jobs)
    await processWorkspaceDeletion(env, job.workspaceId)
}
