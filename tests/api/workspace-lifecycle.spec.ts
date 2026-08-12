import type { H3Event } from 'h3'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs, members, organizations, users, workspaceDeletionJobs } from '../../server/database/schema'
import { getWorkspaceDeletionPreflight, getWorkspaceDeletionStatus, requestWorkspaceDeletion, retryWorkspaceDeletion } from '../../server/services/workspace-deletion'
import { transferWorkspaceOwnership, updateWorkspaceIdentity } from '../../server/services/workspace-lifecycle'
import { permissionsForRole } from '../../shared/auth/permissions'
import { createMembership, createUser, createWorkspace, db } from '../utils'

const workspaceIds: string[] = []
const userIds: string[] = []

function ownerEvent(userId: string, workspaceId: string): H3Event {
  return {
    context: {
      auth: {
        method: 'session',
        user: { id: userId, email: `${userId}@example.com`, name: 'Owner' },
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

afterEach(async () => {
  if (workspaceIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.workspaceRef, workspaceIds))
    await db.delete(organizations).where(inArray(organizations.id, workspaceIds))
  }
  if (userIds.length)
    await db.delete(users).where(inArray(users.id, userIds))
  workspaceIds.length = 0
  userIds.length = 0
})

async function ownerWorkspace() {
  const workspaceId = await createWorkspace()
  const ownerId = await createUser()
  workspaceIds.push(workspaceId)
  userIds.push(ownerId)
  const ownerMemberId = await createMembership(ownerId, workspaceId, 'owner')
  return { workspaceId, ownerId, ownerMemberId, event: ownerEvent(ownerId, workspaceId) }
}

describe('workspace lifecycle', { concurrent: false }, () => {
  it('updates identity, redacts audit values, and reports duplicate slugs', async () => {
    const first = await ownerWorkspace()
    const secondWorkspaceId = await createWorkspace()
    workspaceIds.push(secondWorkspaceId)
    const [second] = await db.select().from(organizations).where(eq(organizations.id, secondWorkspaceId)).limit(1)

    const updated = await updateWorkspaceIdentity(first.event, first.workspaceId, { name: 'Renamed workspace' })
    expect(updated.name).toBe('Renamed workspace')
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.update')).limit(1)
    expect(audit?.metadata).toEqual({ fields: ['name'] })
    expect(JSON.stringify(audit?.metadata)).not.toContain('Renamed workspace')

    await expect(updateWorkspaceIdentity(first.event, first.workspaceId, { slug: second!.slug })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Workspace slug already exists' })
  })

  it('rejects identity updates after deletion starts', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    await expect(updateWorkspaceIdentity(fixture.event, fixture.workspaceId, { name: 'Too late' })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Workspace deletion is in progress' })
  })

  it('promotes the target and demotes the actor in one transfer', async () => {
    const fixture = await ownerWorkspace()
    const targetUserId = await createUser()
    userIds.push(targetUserId)
    const targetMemberId = await createMembership(targetUserId, fixture.workspaceId, 'member')

    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, targetMemberId)).resolves.toMatchObject({ actorRole: 'admin', targetRole: 'owner' })
    const roles = await db.select({ id: members.id, role: members.role }).from(members).where(inArray(members.id, [fixture.ownerMemberId, targetMemberId]))
    expect(Object.fromEntries(roles.map(member => [member.id, member.role]))).toEqual({ [fixture.ownerMemberId]: 'admin', [targetMemberId]: 'owner' })
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.owner.transfer')).limit(1)
    expect(audit?.metadata).toEqual({ actorMemberId: fixture.ownerMemberId, targetMemberId })
  })

  it('rejects stale and ineligible ownership transfers without partial changes', async () => {
    const fixture = await ownerWorkspace()
    const targetUserId = await createUser()
    userIds.push(targetUserId)
    const targetMemberId = await createMembership(targetUserId, fixture.workspaceId, 'owner')

    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, targetMemberId)).rejects.toMatchObject({ statusCode: 409 })
    const roles = await db.select({ role: members.role }).from(members).where(inArray(members.id, [fixture.ownerMemberId, targetMemberId]))
    expect(roles.every(member => member.role === 'owner')).toBe(true)
  })

  it('allows only one concurrent ownership transfer from the same owner', async () => {
    const fixture = await ownerWorkspace()
    const targetUserIds = await Promise.all([createUser(), createUser()])
    userIds.push(...targetUserIds)
    const targetMemberIds = await Promise.all(targetUserIds.map(userId => createMembership(userId, fixture.workspaceId, 'member')))

    const results = await Promise.allSettled(targetMemberIds.map(memberId => transferWorkspaceOwnership(fixture.event, fixture.workspaceId, memberId)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const workspaceMembers = await db.select({ id: members.id, role: members.role }).from(members).where(eq(members.organizationId, fixture.workspaceId))
    expect(workspaceMembers.filter(member => member.role === 'owner')).toHaveLength(1)
    expect(workspaceMembers.find(member => member.id === fixture.ownerMemberId)?.role).toBe('admin')
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.owner.transfer'))).toHaveLength(1)
  })

  it('requires an interactive owner and rejects transfers during deletion', async () => {
    const fixture = await ownerWorkspace()
    const targetUserId = await createUser()
    userIds.push(targetUserId)
    const targetMemberId = await createMembership(targetUserId, fixture.workspaceId, 'member')
    const apiKeyEvent = ownerEvent(fixture.ownerId, fixture.workspaceId)
    apiKeyEvent.context.auth = { ...apiKeyEvent.context.auth!, method: 'api-key', user: null }
    await expect(transferWorkspaceOwnership(apiKeyEvent, fixture.workspaceId, targetMemberId)).rejects.toMatchObject({ statusCode: 403 })

    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, targetMemberId)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Workspace deletion is in progress' })
  })

  it('reports deletion preflight and sanitized pending status', async () => {
    const fixture = await ownerWorkspace()
    expect(await getWorkspaceDeletionPreflight(env, fixture.workspaceId)).toEqual({ activeDomainCount: 0, linkCount: 0, canDelete: true })
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    const status = await getWorkspaceDeletionStatus(env, fixture.workspaceId)
    expect(status).toMatchObject({ state: 'pending', errorCode: null })
    expect(status?.storageDrainUntil).toEqual(expect.any(String))
    expect(await retryWorkspaceDeletion(env, fixture.workspaceId)).toMatchObject({ state: 'pending', errorCode: null })
  })

  it('maps internal deletion failures to recognized public error codes', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    await db.update(workspaceDeletionJobs).set({ state: 'purging', lastErrorCode: 'SomeInternalException' }).where(eq(workspaceDeletionJobs.workspaceId, fixture.workspaceId))
    expect(await getWorkspaceDeletionStatus(env, fixture.workspaceId)).toMatchObject({ state: 'blocked', errorCode: 'cleanup-failed' })
  })
})
