import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { users } from '../database/schema'
import { requireInstanceAdminUser } from '../utils/auth-context'

export async function setInstanceAdminStatus(event: H3Event, targetUserId: string, enabled: boolean) {
  const actor = requireInstanceAdminUser(event)
  const db = drizzle(event.context.cloudflare.env.DB)
  const [target] = await db.select({
    id: users.id,
    emailVerified: users.emailVerified,
    isInstanceAdmin: users.isInstanceAdmin,
  }).from(users).where(eq(users.id, targetUserId)).limit(1)
  if (!target)
    throw createError({ status: 404, statusText: 'User not found' })
  if (enabled && !target.emailVerified)
    throw createError({ status: 409, statusText: 'Only verified users can be instance administrators' })
  if (target.isInstanceAdmin === enabled)
    return { id: target.id, enabled }

  const now = Math.floor(Date.now() / 1000)
  const auditId = crypto.randomUUID()
  const action = enabled ? 'instance-admin.grant' : 'instance-admin.revoke'
  const update = enabled
    ? event.context.cloudflare.env.DB.prepare(`UPDATE user
        SET is_instance_admin = 1, updated_at = ?
        WHERE id = ? AND email_verified = 1 AND is_instance_admin = 0`).bind(now, targetUserId)
    : event.context.cloudflare.env.DB.prepare(`UPDATE user
        SET is_instance_admin = 0, updated_at = ?
        WHERE id = ? AND is_instance_admin = 1
          AND EXISTS (
            SELECT 1 FROM user AS other
            WHERE other.id <> user.id
              AND other.is_instance_admin = 1
              AND other.email_verified = 1
          )`).bind(now, targetUserId)
  const results = await event.context.cloudflare.env.DB.batch([
    update,
    event.context.cloudflare.env.DB.prepare(`INSERT INTO audit_logs
      (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, metadata, created_at)
      SELECT ?, NULL, NULL, 'user', ?, ?, 'user', ?, ?, ? WHERE changes() = 1`)
      .bind(auditId, actor.user.id, action, targetUserId, JSON.stringify({ enabled }), now),
  ])
  if ((results[0]?.meta.changes ?? 0) !== 1)
    throw createError({ status: 409, statusText: enabled ? 'Administrator state changed concurrently' : 'At least one verified instance administrator must remain' })
  return { id: targetUserId, enabled }
}
