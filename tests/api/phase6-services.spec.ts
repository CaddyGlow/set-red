import type { H3Event } from 'h3'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs, invitations, organizations, users, workspaceDeletionJobs } from '../../server/database/schema'
import { createDomain } from '../../server/services/domain'
import { setInstanceAdminStatus } from '../../server/services/instance-admin'
import { createWorkspaceInvitation } from '../../server/services/invitation'
import { processWorkspaceDeletion, requestWorkspaceDeletion } from '../../server/services/workspace-deletion'
import { requireInstanceAdmin } from '../../server/utils/auth-context'
import { permissionsForRole } from '../../shared/auth/permissions'
import { createMembership, createUser, createWorkspace, db } from '../utils'

const createdUserIds: string[] = []
const createdWorkspaceIds: string[] = []

function userEvent(userId: string, workspaceId: string, isInstanceAdmin = false): H3Event {
  return {
    context: {
      auth: {
        method: 'session',
        user: { id: userId, email: `${userId}@example.com`, name: 'Phase 6 User' },
        workspaceId,
        role: 'owner',
        permissions: permissionsForRole('owner'),
        apiKeyId: null,
        isInstanceAdmin,
      },
      cloudflare: { env },
    },
  } as H3Event
}

afterEach(async () => {
  if (createdWorkspaceIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.workspaceRef, createdWorkspaceIds))
    await db.delete(organizations).where(inArray(organizations.id, createdWorkspaceIds))
  }
  if (createdUserIds.length)
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, createdUserIds))
  if (createdUserIds.length)
    await db.delete(users).where(inArray(users.id, createdUserIds))
  createdUserIds.length = 0
  createdWorkspaceIds.length = 0
})

describe('phase 6 service invariants', { concurrent: false }, () => {
  it('keeps one verified administrator under concurrent demotion', async () => {
    const existingAdmins = await db.select({ id: users.id }).from(users).where(eq(users.isInstanceAdmin, true))
    if (existingAdmins.length)
      await db.update(users).set({ isInstanceAdmin: false }).where(inArray(users.id, existingAdmins.map(user => user.id)))
    const workspaceId = await createWorkspace()
    createdWorkspaceIds.push(workspaceId)
    const first = await createUser()
    const second = await createUser()
    createdUserIds.push(first, second)
    await db.update(users).set({ isInstanceAdmin: true }).where(inArray(users.id, [first, second]))
    try {
      const results = await Promise.allSettled([
        setInstanceAdminStatus(userEvent(first, workspaceId, true), first, false),
        setInstanceAdminStatus(userEvent(second, workspaceId, true), second, false),
      ])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      expect((await db.select().from(users).where(inArray(users.id, [first, second]))).filter(user => user.isInstanceAdmin)).toHaveLength(1)
      expect((await db.select().from(auditLogs).where(eq(auditLogs.action, 'instance-admin.revoke'))).filter(entry => [first, second].includes(entry.targetId ?? ''))).toHaveLength(1)
    }
    finally {
      if (existingAdmins.length)
        await db.update(users).set({ isInstanceAdmin: true }).where(inArray(users.id, existingAdmins.map(user => user.id)))
    }
  })

  it('reuses a pending invitation when email delivery fails', async () => {
    const workspaceId = await createWorkspace()
    const userId = await createUser()
    createdWorkspaceIds.push(workspaceId)
    createdUserIds.push(userId)
    await createMembership(userId, workspaceId, 'owner')
    const event = userEvent(userId, workspaceId)
    const input = { email: `INVITED-${crypto.randomUUID()}@Example.com`, role: 'member' as const }
    const first = await createWorkspaceInvitation(event, workspaceId, userId, input)
    const second = await createWorkspaceInvitation(event, workspaceId, userId, input)
    expect(second.id).toBe(first.id)
    expect(first.deliveryStatus).toBe('failed')
    expect(await db.select().from(invitations).where(eq(invitations.organizationId, workspaceId))).toHaveLength(1)
  })

  it('rejects invitations for existing workspace members', async () => {
    const workspaceId = await createWorkspace()
    const ownerId = await createUser()
    const memberId = await createUser()
    createdWorkspaceIds.push(workspaceId)
    createdUserIds.push(ownerId, memberId)
    await createMembership(ownerId, workspaceId, 'owner')
    await createMembership(memberId, workspaceId, 'member')
    const [member] = await db.select({ email: users.email }).from(users).where(eq(users.id, memberId)).limit(1)

    await expect(createWorkspaceInvitation(userEvent(ownerId, workspaceId), workspaceId, ownerId, {
      email: member!.email.toUpperCase(),
      role: 'member',
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.select().from(invitations).where(eq(invitations.organizationId, workspaceId))).toHaveLength(0)
  })

  it('rejects domain creation after workspace deletion starts', async () => {
    const workspaceId = await createWorkspace()
    const userId = await createUser()
    createdWorkspaceIds.push(workspaceId)
    createdUserIds.push(userId)
    await createMembership(userId, workspaceId, 'owner')
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, workspaceId)).limit(1)
    const event = userEvent(userId, workspaceId, true)
    await requestWorkspaceDeletion(event, workspaceId, workspace!.slug, true)

    await expect(createDomain(event, {
      id: crypto.randomUUID(),
      workspaceId,
      hostname: `${crypto.randomUUID()}.example.com`,
      status: 'active',
      isPrimary: false,
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('purges workspace R2 prefixes and retains the audit workspace reference', async () => {
    const workspaceId = await createWorkspace()
    const userId = await createUser()
    createdWorkspaceIds.push(workspaceId)
    createdUserIds.push(userId)
    await createMembership(userId, workspaceId, 'owner')
    const workspace = (await db.select().from(organizations).where(eq(organizations.id, workspaceId)))[0]!
    await requestWorkspaceDeletion(userEvent(userId, workspaceId), workspaceId, workspace.slug)
    await db.update(workspaceDeletionJobs).set({ storageDrainUntil: new Date(0) }).where(eq(workspaceDeletionJobs.workspaceId, workspaceId))
    const uploadKey = `uploads/${workspaceId}/phase6-test.png`
    const backupKey = `backups/${workspaceId}/phase6-test.json`
    await env.R2.put(uploadKey, 'upload')
    await env.R2.put(backupKey, 'backup')
    expect(await processWorkspaceDeletion(env, workspaceId)).toBe('purging')
    expect(await processWorkspaceDeletion(env, workspaceId)).toBe('complete')
    expect(await env.R2.get(uploadKey)).toBeNull()
    expect(await env.R2.get(backupKey)).toBeNull()
    expect(await db.select().from(auditLogs).where(eq(auditLogs.workspaceRef, workspaceId))).not.toHaveLength(0)
    createdWorkspaceIds.splice(createdWorkspaceIds.indexOf(workspaceId), 1)
  })

  it('rejects workspace API keys on every admin route', async () => {
    const event = userEvent('api-key', 'workspace')
    event.context.auth = {
      ...event.context.auth!,
      method: 'api-key',
      user: null,
      isInstanceAdmin: false,
    }
    expect(() => requireInstanceAdmin(event)).toThrowError(expect.objectContaining({ statusCode: 403 }))
  })
})
