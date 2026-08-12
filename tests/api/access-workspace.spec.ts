import type { H3Event } from 'h3'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs, members, organizations, userPreferences, users } from '../../server/database/schema'
import { ensureAccessWorkspace, setAccessActiveWorkspace } from '../../server/services/access-workspace'
import { createMembership, createUser, createWorkspace, db } from '../utils'

const createdUserIds: string[] = []

afterEach(async () => {
  for (const userId of createdUserIds) {
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userId))
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId))
    await db.delete(organizations).where(eq(organizations.id, `access-${userId}`))
    await db.delete(users).where(eq(users.id, userId))
  }
  createdUserIds.length = 0
})

describe('cloudflare Access workspace provisioning', { concurrent: false }, () => {
  it('creates one owner workspace across overlapping first requests', async () => {
    const userId = await createUser()
    createdUserIds.push(userId)
    const event = { context: { cloudflare: { env } } } as H3Event
    const results = await Promise.all([
      ensureAccessWorkspace(event, { id: userId, name: 'Access User' }),
      ensureAccessWorkspace(event, { id: userId, name: 'Access User' }),
    ])
    expect(results[0]).toEqual(results[1])
    expect(results[0]?.role).toBe('owner')
    expect(await db.select().from(members).where(eq(members.userId, userId))).toHaveLength(1)
    expect(await db.select().from(organizations).where(eq(organizations.id, results[0]!.workspaceId))).toHaveLength(1)
  })

  it('persists an explicitly selected membership and restores it', async () => {
    const userId = await createUser()
    createdUserIds.push(userId)
    const firstWorkspaceId = await createWorkspace()
    const secondWorkspaceId = await createWorkspace()
    await createMembership(userId, firstWorkspaceId, 'member')
    await createMembership(userId, secondWorkspaceId, 'viewer')
    const event = { context: { cloudflare: { env } } } as H3Event

    await setAccessActiveWorkspace(event, userId, secondWorkspaceId)
    expect(await ensureAccessWorkspace(event, { id: userId, name: 'Access User' })).toEqual({
      workspaceId: secondWorkspaceId,
      role: 'viewer',
    })

    await db.delete(organizations).where(eq(organizations.id, firstWorkspaceId))
    await db.delete(organizations).where(eq(organizations.id, secondWorkspaceId))
  })
})
