import type { H3Event } from 'h3'
import type { WorkspaceSettings, WorkspaceSettingsUpdate } from '#shared/schemas/workspace'
import { and, eq, isNull, ne, notExists, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { WorkspaceSettingsSchema } from '../../shared/schemas/workspace'
import { auditLogs, links, organizations, workspaceSettings } from '../database/schema'
import { writeAuditLog } from '../utils/audit'
import { requireAuth } from '../utils/auth-context'
import { throwWorkspaceWriteConflict, workspaceWritableCondition } from '../utils/workspace-write'

function publicSettings(settings: typeof workspaceSettings.$inferSelect): WorkspaceSettings {
  return WorkspaceSettingsSchema.parse({
    webhookUrl: settings.webhookUrl,
    webhookSecretConfigured: Boolean(settings.webhookSecret),
    defaultSlugLength: settings.defaultSlugLength,
    caseSensitive: settings.caseSensitive,
    redirectStatusCode: settings.redirectStatusCode,
  })
}

export async function getWorkspaceSettings(event: H3Event, workspaceId: string): Promise<WorkspaceSettings> {
  const [settings] = await drizzle(event.context.cloudflare.env.DB)
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1)
  if (!settings)
    throw createError({ status: 404, statusText: 'Workspace settings not found' })
  return publicSettings(settings)
}

export async function updateWorkspaceSettings(
  event: H3Event,
  workspaceId: string,
  input: WorkspaceSettingsUpdate,
): Promise<WorkspaceSettings> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const [existing] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1)
  if (!existing)
    throw createError({ status: 404, statusText: 'Workspace settings not found' })
  const fields = (Object.keys(input) as (keyof WorkspaceSettingsUpdate)[])
    .filter(field => input[field] !== undefined && !Object.is(input[field], existing[field]))
  if (!fields.length)
    return publicSettings(existing)
  const changes = Object.fromEntries(fields.map(field => [field, input[field]])) as WorkspaceSettingsUpdate
  const caseTransitionAllowed = changes.caseSensitive === false
    ? or(
        eq(workspaceSettings.caseSensitive, false),
        notExists(db.select({ id: links.id }).from(links).where(and(
          eq(links.workspaceId, workspaceId),
          ne(links.slug, sql<string>`lower(${links.slug})`),
        ))),
      )
    : undefined
  const auth = requireAuth(event)
  const [updated, audited] = await db.batch([
    db.update(workspaceSettings)
      .set(changes)
      .where(and(
        eq(workspaceSettings.workspaceId, workspaceId),
        eq(workspaceSettings.defaultSlugLength, existing.defaultSlugLength),
        eq(workspaceSettings.caseSensitive, existing.caseSensitive),
        eq(workspaceSettings.redirectStatusCode, existing.redirectStatusCode),
        existing.webhookUrl === null ? isNull(workspaceSettings.webhookUrl) : eq(workspaceSettings.webhookUrl, existing.webhookUrl),
        workspaceWritableCondition(db, workspaceId),
        caseTransitionAllowed,
      ))
      .returning(),
    db.insert(auditLogs).select(db.select({
      id: sql<string>`${crypto.randomUUID()}`.as('id'),
      workspaceId: organizations.id,
      workspaceRef: organizations.id,
      actorType: sql<'user' | 'api-key' | 'access-service'>`${auth.method === 'api-key' ? 'api-key' : auth.method === 'access-service' ? 'access-service' : 'user'}`.as('actor_type'),
      actorId: sql<string>`${auth.apiKeyId ?? auth.user?.id ?? auth.method}`.as('actor_id'),
      action: sql<string>`'workspace.settings.update'`.as('action'),
      targetType: sql<string>`'workspace'`.as('target_type'),
      targetId: organizations.id,
      metadata: sql<Record<string, unknown>>`${JSON.stringify({ fields })}`.as('metadata'),
      createdAt: sql<number>`${Math.floor(Date.now() / 1000)}`.as('created_at'),
    }).from(organizations).where(and(
      eq(organizations.id, workspaceId),
      sql`changes() = 1`,
    ))).returning({ id: auditLogs.id }),
  ])
  const settings = updated[0]

  if (!settings || !audited.length) {
    const [current] = await db.select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1)
    if (!current)
      throw createError({ status: 404, statusText: 'Workspace settings not found' })

    if (changes.caseSensitive === false && current.caseSensitive) {
      const [summary] = await db.select({ count: sql<number>`count(*)` })
        .from(links)
        .where(and(
          eq(links.workspaceId, workspaceId),
          ne(links.slug, sql<string>`lower(${links.slug})`),
        ))
      if (summary?.count) {
        throw createError({
          status: 409,
          statusText: 'Mixed-case links must be renamed before disabling case sensitivity',
          data: { incompatibleLinks: summary.count },
        })
      }
    }

    return throwWorkspaceWriteConflict(db, workspaceId, 'Workspace settings changed concurrently')
  }

  return publicSettings(settings)
}

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `whsec_${btoa(String.fromCharCode(...bytes))}`
}

export async function rotateWorkspaceWebhookSecret(event: H3Event, workspaceId: string): Promise<{ secret: string, webhookSecretConfigured: true }> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const webhookSecret = generateWebhookSecret()
  const [updated] = await db.update(workspaceSettings)
    .set({ webhookSecret })
    .where(and(
      eq(workspaceSettings.workspaceId, workspaceId),
      workspaceWritableCondition(db, workspaceId),
    ))
    .returning({ workspaceId: workspaceSettings.workspaceId })
  if (!updated) {
    const [existing] = await db.select({ workspaceId: workspaceSettings.workspaceId }).from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1)
    if (!existing)
      throw createError({ status: 404, statusText: 'Workspace settings not found' })
    await throwWorkspaceWriteConflict(db, workspaceId)
  }
  await writeAuditLog(event, { action: 'webhook.secret.rotate', targetType: 'workspace', targetId: workspaceId })
  return { secret: webhookSecret, webhookSecretConfigured: true }
}

export async function removeWorkspaceWebhookSecret(event: H3Event, workspaceId: string): Promise<{ webhookSecretConfigured: false }> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const [updated] = await db.update(workspaceSettings)
    .set({ webhookSecret: null })
    .where(and(
      eq(workspaceSettings.workspaceId, workspaceId),
      workspaceWritableCondition(db, workspaceId),
    ))
    .returning({ workspaceId: workspaceSettings.workspaceId })
  if (!updated) {
    const [existing] = await db.select({ workspaceId: workspaceSettings.workspaceId }).from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1)
    if (!existing)
      throw createError({ status: 404, statusText: 'Workspace settings not found' })
    await throwWorkspaceWriteConflict(db, workspaceId)
  }
  await writeAuditLog(event, { action: 'webhook.secret.remove', targetType: 'workspace', targetId: workspaceId })
  return { webhookSecretConfigured: false }
}
