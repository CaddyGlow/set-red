import type { H3Event } from 'h3'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs, domains, links, organizations, users, workspaceDeletionJobs, workspaceSettings } from '../../server/database/schema'
import {
  getWorkspaceSettings,
  removeWorkspaceWebhookSecret,
  rotateWorkspaceWebhookSecret,
  updateWorkspaceSettings,
} from '../../server/services/workspace-settings'
import { permissionsForRole } from '../../shared/auth/permissions'
import { WorkspaceSettingsUpdateSchema } from '../../shared/schemas/workspace'
import { createMembership, createUser, createWorkspace, db } from '../utils'

const workspaceIds: string[] = []
const userIds: string[] = []

function settingsEvent(userId: string, workspaceId: string): H3Event {
  return {
    context: {
      auth: {
        method: 'session',
        user: { id: userId, email: `${userId}@example.com`, name: 'Settings User' },
        workspaceId,
        role: 'owner',
        permissions: permissionsForRole('owner'),
        apiKeyId: null,
        isInstanceAdmin: false,
      },
      cloudflare: { env },
    },
  } as H3Event
}

async function fixture() {
  const workspaceId = await createWorkspace()
  const userId = await createUser()
  await createMembership(userId, workspaceId, 'owner')
  workspaceIds.push(workspaceId)
  userIds.push(userId)
  return { workspaceId, userId, event: settingsEvent(userId, workspaceId) }
}

afterEach(async () => {
  if (workspaceIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.workspaceRef, workspaceIds))
    await db.delete(organizations).where(inArray(organizations.id, workspaceIds))
  }
  if (userIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds))
    await db.delete(users).where(inArray(users.id, userIds))
  }
  workspaceIds.length = 0
  userIds.length = 0
})

describe('workspace settings contracts', { concurrent: false }, () => {
  it('returns only the configured state and preserves a secret during ordinary updates', async () => {
    const { workspaceId, event } = await fixture()
    const storedSecret = `whsec_${btoa('a'.repeat(32))}`
    await db.update(workspaceSettings).set({ webhookSecret: storedSecret }).where(eq(workspaceSettings.workspaceId, workspaceId))

    expect(await getWorkspaceSettings(event, workspaceId)).toEqual(expect.objectContaining({
      webhookSecretConfigured: true,
      webhookUrl: null,
    }))
    const result = await updateWorkspaceSettings(event, workspaceId, {
      webhookUrl: 'https://webhook.example.com/events',
      defaultSlugLength: 9,
    })
    expect(result).not.toHaveProperty('webhookSecret')
    expect((await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)))[0]?.webhookSecret).toBe(storedSecret)

    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.settings.update'))
    expect(audit?.metadata).toEqual({ fields: ['webhookUrl', 'defaultSlugLength'] })
    expect(JSON.stringify(audit)).not.toContain(storedSecret)
    expect(JSON.stringify(audit)).not.toContain('webhook.example.com')
  })

  it('rejects unsafe webhook URLs in the shared update contract', () => {
    for (const webhookUrl of [
      'http://example.com/events',
      'https://localhost/events',
      'https://127.0.0.1/events',
      'https://10.0.0.1/events',
      'https://[::1]/events',
      'https://[2001:db8::1]/events',
      'https://user:password@example.com/events',
    ])
      expect(() => WorkspaceSettingsUpdateSchema.parse({ webhookUrl })).toThrow()

    expect(WorkspaceSettingsUpdateSchema.parse({ webhookUrl: 'https://hooks.example.com/events' })).toEqual({ webhookUrl: 'https://hooks.example.com/events' })
    expect(() => WorkspaceSettingsUpdateSchema.parse({ webhookSecret: 'client-controlled-secret' })).toThrow()
  })

  it('rotates and removes a server-generated secret without auditing it', async () => {
    const { workspaceId, event } = await fixture()
    const rotated = await rotateWorkspaceWebhookSecret(event, workspaceId)
    expect(rotated.secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/)
    expect(rotated.webhookSecretConfigured).toBe(true)
    expect((await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)))[0]?.webhookSecret).toBe(rotated.secret)

    expect(await removeWorkspaceWebhookSecret(event, workspaceId)).toEqual({ webhookSecretConfigured: false })
    expect((await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)))[0]?.webhookSecret).toBeNull()
    const audits = await db.select().from(auditLogs).where(inArray(auditLogs.action, ['webhook.secret.rotate', 'webhook.secret.remove']))
    expect(audits.map(entry => entry.action).sort()).toEqual(['webhook.secret.remove', 'webhook.secret.rotate'])
    expect(JSON.stringify(audits)).not.toContain(rotated.secret)
  })

  it('atomically rejects settings and secret writes after deletion starts', async () => {
    const { workspaceId, userId, event } = await fixture()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, workspaceId))
    const now = new Date()
    await db.insert(workspaceDeletionJobs).values({
      workspaceId,
      requestedByType: 'user',
      requestedById: userId,
      workspaceSlug: workspace!.slug,
      state: 'pending',
      storageDrainUntil: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    })

    await expect(updateWorkspaceSettings(event, workspaceId, { defaultSlugLength: 12 })).rejects.toMatchObject({ statusCode: 409 })
    await expect(rotateWorkspaceWebhookSecret(event, workspaceId)).rejects.toMatchObject({ statusCode: 409 })
    await expect(removeWorkspaceWebhookSecret(event, workspaceId)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)))[0]).toEqual(expect.objectContaining({
      defaultSlugLength: 6,
      webhookSecret: null,
    }))
  })

  it('rejects disabling case sensitivity while mixed-case slugs exist', async () => {
    const { workspaceId, event } = await fixture()
    const domainId = crypto.randomUUID()
    await db.insert(domains).values({ id: domainId, workspaceId, hostname: `${crypto.randomUUID()}.example.com`, status: 'active', isPrimary: true, createdAt: Math.floor(Date.now() / 1000) })
    await db.update(workspaceSettings).set({ caseSensitive: true }).where(eq(workspaceSettings.workspaceId, workspaceId))
    const now = Math.floor(Date.now() / 1000)
    await db.insert(links).values({
      id: crypto.randomUUID().slice(0, 26),
      workspaceId,
      domainId,
      slug: 'MixedCase',
      url: 'https://example.com',
      normalizedUrl: 'https://example.com/',
      createdAt: now,
      updatedAt: now,
    })

    await expect(updateWorkspaceSettings(event, workspaceId, { caseSensitive: false })).rejects.toMatchObject({
      statusCode: 409,
      data: { incompatibleLinks: 1 },
    })
    expect((await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)))[0]?.caseSensitive).toBe(true)
  })
})
