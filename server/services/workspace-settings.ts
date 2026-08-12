import type { H3Event } from 'h3'
import type { WorkspaceSettings, WorkspaceSettingsUpdate } from '#shared/schemas/workspace'
import { and, eq, ne, notExists, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { WorkspaceSettingsSchema } from '../../shared/schemas/workspace'
import { links, workspaceSettings } from '../database/schema'
import { writeAuditLog } from '../utils/audit'
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
  const caseTransitionAllowed = input.caseSensitive === false
    ? or(
        eq(workspaceSettings.caseSensitive, false),
        notExists(db.select({ id: links.id }).from(links).where(and(
          eq(links.workspaceId, workspaceId),
          ne(links.slug, sql<string>`lower(${links.slug})`),
        ))),
      )
    : undefined

  const [settings] = await db.update(workspaceSettings)
    .set(input)
    .where(and(
      eq(workspaceSettings.workspaceId, workspaceId),
      workspaceWritableCondition(db, workspaceId),
      caseTransitionAllowed,
    ))
    .returning()

  if (!settings) {
    const [current] = await db.select({ caseSensitive: workspaceSettings.caseSensitive })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1)
    if (!current)
      throw createError({ status: 404, statusText: 'Workspace settings not found' })

    if (input.caseSensitive === false && current.caseSensitive) {
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

  await writeAuditLog(event, {
    action: 'workspace.settings.update',
    targetType: 'workspace',
    targetId: workspaceId,
    metadata: { fields: Object.keys(input) },
  })
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
