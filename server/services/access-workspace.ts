import type { H3Event } from 'h3'
import type { Role } from '#shared/auth/permissions'
import { and, asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { members, userPreferences } from '../database/schema'

export interface AccessWorkspace {
  workspaceId: string
  role: Role
}

function workspaceSlug(name: string, userId: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
  return `${base.slice(0, 48)}-${userId.replaceAll('-', '').slice(0, 12)}`
}

async function selectMembership(event: H3Event, userId: string, workspaceId?: string | null): Promise<AccessWorkspace | null> {
  const rows = await drizzle(event.context.cloudflare.env.DB).select({
    workspaceId: members.organizationId,
    role: members.role,
  }).from(members).where(and(
    eq(members.userId, userId),
    workspaceId ? eq(members.organizationId, workspaceId) : undefined,
  )).orderBy(asc(members.createdAt), asc(members.organizationId)).limit(1)
  return rows[0] ?? null
}

export async function setAccessActiveWorkspace(event: H3Event, userId: string, workspaceId: string): Promise<AccessWorkspace> {
  const membership = await selectMembership(event, userId, workspaceId)
  if (!membership)
    throw createError({ status: 403, statusText: 'Workspace membership required' })
  const now = new Date()
  await drizzle(event.context.cloudflare.env.DB).insert(userPreferences).values({
    userId,
    activeWorkspaceId: workspaceId,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userPreferences.userId,
    set: { activeWorkspaceId: workspaceId, updatedAt: now },
  })
  return membership
}

export async function ensureAccessWorkspace(
  event: H3Event,
  user: { id: string, name: string },
): Promise<AccessWorkspace> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const [preference] = await db.select({ activeWorkspaceId: userPreferences.activeWorkspaceId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1)
  const selected = preference?.activeWorkspaceId
    ? await selectMembership(event, user.id, preference.activeWorkspaceId)
    : null
  if (selected)
    return selected

  const existing = await selectMembership(event, user.id)
  if (existing) {
    await setAccessActiveWorkspace(event, user.id, existing.workspaceId)
    return existing
  }

  const workspaceId = `access-${user.id}`
  const memberId = `access-owner-${user.id}`
  const auditId = `access-provision-${user.id}`
  const now = Math.floor(Date.now() / 1000)
  const hasNoMembership = 'NOT EXISTS (SELECT 1 FROM member WHERE user_id = ?)'
  await event.context.cloudflare.env.DB.batch([
    event.context.cloudflare.env.DB.prepare(`INSERT INTO organization (id, name, slug, created_at)
      SELECT ?, ?, ?, ? WHERE ${hasNoMembership}
      ON CONFLICT(id) DO NOTHING`).bind(workspaceId, `${user.name}'s Workspace`, workspaceSlug(user.name, user.id), now, user.id),
    event.context.cloudflare.env.DB.prepare(`INSERT INTO member (id, organization_id, user_id, role, created_at)
      SELECT ?, ?, ?, 'owner', ? WHERE ${hasNoMembership}
      ON CONFLICT(id) DO NOTHING`).bind(memberId, workspaceId, user.id, now, user.id),
    event.context.cloudflare.env.DB.prepare(`INSERT INTO workspace_settings (workspace_id)
      SELECT ? WHERE EXISTS (SELECT 1 FROM member WHERE id = ?)
      ON CONFLICT(workspace_id) DO NOTHING`).bind(workspaceId, memberId),
    event.context.cloudflare.env.DB.prepare(`INSERT INTO user_preferences (user_id, active_workspace_id, updated_at)
      SELECT ?, organization_id, ? FROM member WHERE id = ?
      ON CONFLICT(user_id) DO UPDATE SET active_workspace_id = excluded.active_workspace_id, updated_at = excluded.updated_at`).bind(user.id, now, memberId),
    event.context.cloudflare.env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, created_at)
      SELECT ?, ?, ?, 'user', ?, 'workspace.access-provision', 'workspace', ?, ? WHERE EXISTS (SELECT 1 FROM member WHERE id = ?)
      ON CONFLICT(id) DO NOTHING`).bind(auditId, workspaceId, workspaceId, user.id, workspaceId, now, memberId),
  ])

  const provisioned = await selectMembership(event, user.id)
  if (!provisioned)
    throw createError({ status: 500, statusText: 'Unable to provision an Access workspace' })
  await db.insert(userPreferences).values({ userId: user.id, activeWorkspaceId: provisioned.workspaceId, updatedAt: new Date() }).onConflictDoUpdate({ target: userPreferences.userId, set: { activeWorkspaceId: provisioned.workspaceId, updatedAt: new Date() } })
  return provisioned
}
