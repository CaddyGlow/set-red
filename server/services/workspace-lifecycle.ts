import type { H3Event } from 'h3'
import type { z } from 'zod'
import type { WorkspaceUpdateSchema } from '#shared/schemas/workspace'
import { and, eq, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { members, organizations } from '../database/schema'
import { requireInteractiveUser, requirePermission } from '../utils/auth-context'
import { assertWorkspaceTarget } from '../utils/workspace-authorization'
import { throwWorkspaceWriteConflict } from '../utils/workspace-write'

type WorkspaceUpdate = z.infer<typeof WorkspaceUpdateSchema>

function isUniqueSlugError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('UNIQUE constraint failed: organization.slug')
}

export async function updateWorkspaceIdentity(event: H3Event, workspaceId: string, input: WorkspaceUpdate) {
  const auth = requireInteractiveUser(event)
  requirePermission(event, 'workspace.settings')
  await assertWorkspaceTarget(event, workspaceId)
  const db = drizzle(event.context.cloudflare.env.DB)
  const [existingWorkspace] = await db.select().from(organizations).where(eq(organizations.id, workspaceId)).limit(1)
  if (!existingWorkspace)
    throw createError({ status: 404, statusText: 'Workspace not found' })

  if (input.slug) {
    const [conflict] = await db.select({ id: organizations.id }).from(organizations).where(and(
      eq(organizations.slug, input.slug),
      ne(organizations.id, workspaceId),
    )).limit(1)
    if (conflict)
      throw createError({ status: 409, statusText: 'Workspace slug already exists' })
  }

  const name = input.name ?? existingWorkspace.name
  const slug = input.slug ?? existingWorkspace.slug
  const fields = [
    ...(name !== existingWorkspace.name ? ['name'] : []),
    ...(slug !== existingWorkspace.slug ? ['slug'] : []),
  ]
  if (!fields.length)
    return existingWorkspace

  try {
    const [updated, audited] = await event.context.cloudflare.env.DB.batch([
      event.context.cloudflare.env.DB.prepare(`UPDATE organization
        SET name = ?, slug = ?
        WHERE id = ?
          AND NOT EXISTS (SELECT 1 FROM workspace_deletion_jobs WHERE workspace_id = ?)
          AND name = ? AND slug = ?
          AND (name <> ? OR slug <> ?)`).bind(
        name,
        slug,
        workspaceId,
        workspaceId,
        existingWorkspace.name,
        existingWorkspace.slug,
        name,
        slug,
      ),
      event.context.cloudflare.env.DB.prepare(`INSERT INTO audit_logs
        (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
        SELECT ?, ?, ?, 'user', ?, 'workspace.update', 'workspace', ?, ?, ?
        WHERE changes() = 1`).bind(
        crypto.randomUUID(),
        workspaceId,
        workspaceId,
        auth.user.id,
        workspaceId,
        JSON.stringify({ fields }),
        Math.floor(Date.now() / 1000),
      ),
    ])
    if (updated?.meta.changes !== 1 || audited?.meta.changes !== 1) {
      const [current] = await db.select().from(organizations).where(eq(organizations.id, workspaceId)).limit(1)
      if (current?.name === name && current.slug === slug)
        return current
      await throwWorkspaceWriteConflict(db, workspaceId, 'Workspace update conflict')
    }
    return { ...existingWorkspace, name, slug }
  }
  catch (error) {
    if (isUniqueSlugError(error))
      throw createError({ status: 409, statusText: 'Workspace slug already exists' })
    throw error
  }
}

export async function transferWorkspaceOwnership(event: H3Event, workspaceId: string, targetMemberId: string) {
  const auth = requireInteractiveUser(event)
  requirePermission(event, 'workspace.transfer')
  await assertWorkspaceTarget(event, workspaceId)
  const db = drizzle(event.context.cloudflare.env.DB)
  const [actor] = await db.select({ id: members.id }).from(members).where(and(
    eq(members.organizationId, workspaceId),
    eq(members.userId, auth.user.id),
    eq(members.role, 'owner'),
  )).limit(1)
  if (!actor)
    throw createError({ status: 409, statusText: 'Workspace ownership changed; refresh and try again' })
  if (actor.id === targetMemberId)
    throw createError({ status: 400, statusText: 'Ownership must be transferred to another member' })

  const auditId = crypto.randomUUID()
  const [updated, audited] = await event.context.cloudflare.env.DB.batch([
    event.context.cloudflare.env.DB.prepare(`UPDATE member
      SET role = CASE WHEN id = ? THEN 'admin' ELSE 'owner' END
      WHERE organization_id = ? AND id IN (?, ?)
        AND EXISTS (SELECT 1 FROM member actor WHERE actor.id = ? AND actor.organization_id = ? AND actor.user_id = ? AND actor.role = 'owner')
        AND EXISTS (SELECT 1 FROM member target WHERE target.id = ? AND target.organization_id = ? AND target.role <> 'owner')
        AND NOT EXISTS (SELECT 1 FROM workspace_deletion_jobs WHERE workspace_id = ?)`).bind(
      actor.id,
      workspaceId,
      actor.id,
      targetMemberId,
      actor.id,
      workspaceId,
      auth.user.id,
      targetMemberId,
      workspaceId,
      workspaceId,
    ),
    event.context.cloudflare.env.DB.prepare(`INSERT INTO audit_logs
      (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
      SELECT ?, ?, ?, 'user', ?, 'workspace.owner.transfer', 'member', ?, ?, ?
      WHERE changes() = 2`).bind(
      auditId,
      workspaceId,
      workspaceId,
      auth.user.id,
      targetMemberId,
      JSON.stringify({ actorMemberId: actor.id, targetMemberId }),
      Math.floor(Date.now() / 1000),
    ),
  ])

  if (updated?.meta.changes !== 2 || audited?.meta.changes !== 1) {
    await throwWorkspaceWriteConflict(db, workspaceId, 'Workspace ownership changed; refresh and try again')
  }
  return { actorMemberId: actor.id, targetMemberId, actorRole: 'admin' as const, targetRole: 'owner' as const }
}
