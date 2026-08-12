import type { H3Event } from 'h3'
import type { Role } from '../../shared/auth/permissions'
import type { AuthMethod } from '../../shared/types/auth'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs, domains, links, members, organizations, users, workspaceDeletionJobs } from '../../server/database/schema'
import { getWorkspaceDeletionPreflight, getWorkspaceDeletionStatus, requestWorkspaceDeletion, retryWorkspaceDeletion } from '../../server/services/workspace-deletion'
import { transferWorkspaceOwnership, updateWorkspaceIdentity } from '../../server/services/workspace-lifecycle'
import { permissionsForRole } from '../../shared/auth/permissions'
import { createMembership, createUser, createWorkspace, db } from '../utils'

const workspaceIds: string[] = []
const userIds: string[] = []

function userEvent(userId: string, workspaceId: string, role: Role = 'owner', method: AuthMethod = 'session'): H3Event {
  return {
    context: {
      auth: {
        method,
        user: ['session', 'access-user'].includes(method) ? { id: userId, email: `${userId}@example.com`, name: 'User' } : null,
        workspaceId,
        role,
        permissions: permissionsForRole(role),
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
  return { workspaceId, ownerId, ownerMemberId, event: userEvent(ownerId, workspaceId) }
}

describe('workspace lifecycle', { concurrent: false }, () => {
  it('updates identity, redacts audit values, and reports duplicate slugs', async () => {
    const first = await ownerWorkspace()
    const secondWorkspaceId = await createWorkspace()
    workspaceIds.push(secondWorkspaceId)
    const [second] = await db.select().from(organizations).where(eq(organizations.id, secondWorkspaceId)).limit(1)

    const [before] = await db.select().from(organizations).where(eq(organizations.id, first.workspaceId)).limit(1)
    const updated = await updateWorkspaceIdentity(first.event, first.workspaceId, { name: 'Renamed workspace', slug: before!.slug })
    expect(updated.name).toBe('Renamed workspace')
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.update')).limit(1)
    expect(audit?.metadata).toEqual({ fields: ['name'] })
    expect(JSON.stringify(audit?.metadata)).not.toContain('Renamed workspace')

    await expect(updateWorkspaceIdentity(first.event, first.workspaceId, { slug: second!.slug })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Workspace slug already exists' })
  })

  it('updates slugs for administrators and Access users but rejects noninteractive identities', async () => {
    const workspaceId = await createWorkspace()
    workspaceIds.push(workspaceId)
    const adminId = await createUser()
    userIds.push(adminId)
    await createMembership(adminId, workspaceId, 'admin')
    const slug = `renamed-${crypto.randomUUID()}`
    await expect(updateWorkspaceIdentity(userEvent(adminId, workspaceId, 'admin', 'access-user'), workspaceId, { slug })).resolves.toMatchObject({ slug })

    for (const method of ['api-key', 'access-service'] as const) {
      await expect(updateWorkspaceIdentity(userEvent(adminId, workspaceId, 'admin', method), workspaceId, { name: method })).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('does not audit an identity request that changes no persisted values', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await updateWorkspaceIdentity(fixture.event, fixture.workspaceId, { name: workspace!.name, slug: workspace!.slug })
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.update'))).toHaveLength(0)
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
    const apiKeyEvent = userEvent(fixture.ownerId, fixture.workspaceId)
    apiKeyEvent.context.auth = { ...apiKeyEvent.context.auth!, method: 'api-key', user: null }
    await expect(transferWorkspaceOwnership(apiKeyEvent, fixture.workspaceId, targetMemberId)).rejects.toMatchObject({ statusCode: 403 })
    await expect(transferWorkspaceOwnership(userEvent(fixture.ownerId, fixture.workspaceId, 'admin'), fixture.workspaceId, targetMemberId)).rejects.toMatchObject({ statusCode: 403 })

    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, targetMemberId)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'Workspace deletion is in progress' })
  })

  it('rejects self, missing, and other-workspace transfer targets', async () => {
    const fixture = await ownerWorkspace()
    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, fixture.ownerMemberId)).rejects.toMatchObject({ statusCode: 400 })
    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 409 })

    const otherWorkspaceId = await createWorkspace()
    const otherUserId = await createUser()
    workspaceIds.push(otherWorkspaceId)
    userIds.push(otherUserId)
    const otherMemberId = await createMembership(otherUserId, otherWorkspaceId, 'member')
    await expect(transferWorkspaceOwnership(fixture.event, fixture.workspaceId, otherMemberId)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.select().from(members).where(eq(members.id, fixture.ownerMemberId)))[0]?.role).toBe('owner')
  })

  it('preserves additional owners during ownership transfer', async () => {
    const fixture = await ownerWorkspace()
    const [otherOwnerId, targetUserId] = await Promise.all([createUser(), createUser()])
    userIds.push(otherOwnerId, targetUserId)
    const otherOwnerMemberId = await createMembership(otherOwnerId, fixture.workspaceId, 'owner')
    const targetMemberId = await createMembership(targetUserId, fixture.workspaceId, 'member')
    await transferWorkspaceOwnership(fixture.event, fixture.workspaceId, targetMemberId)
    const roles = await db.select({ id: members.id, role: members.role }).from(members).where(eq(members.organizationId, fixture.workspaceId))
    expect(roles.find(member => member.id === otherOwnerMemberId)?.role).toBe('owner')
    expect(roles.filter(member => member.role === 'owner')).toHaveLength(2)
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

  it('reports blocking preflight counts and rejects deletion requests with dependencies', async () => {
    const fixture = await ownerWorkspace()
    const domainId = crypto.randomUUID()
    await db.insert(domains).values({ id: domainId, workspaceId: fixture.workspaceId, hostname: `${crypto.randomUUID()}.example.com`, status: 'active', isPrimary: false, createdAt: Math.floor(Date.now() / 1000) })
    const now = Math.floor(Date.now() / 1000)
    await db.insert(links).values({ id: crypto.randomUUID(), domainId, workspaceId: fixture.workspaceId, slug: 'blocked', url: 'https://example.com', normalizedUrl: 'https://example.com', createdAt: now, updatedAt: now })
    expect(await getWorkspaceDeletionPreflight(env, fixture.workspaceId)).toEqual({ activeDomainCount: 1, linkCount: 1, canDelete: false })
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await expect(requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, fixture.workspaceId))).toHaveLength(0)
  })

  it('requires exact confirmation and makes deletion requests idempotent', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await expect(requestWorkspaceDeletion(fixture.event, fixture.workspaceId, `${workspace!.slug}-wrong`)).rejects.toMatchObject({ statusCode: 400 })
    const [first, second] = await Promise.all([
      requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug),
      requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug),
    ])
    expect(second.workspaceId).toBe(first.workspaceId)
    expect(await db.select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, fixture.workspaceId))).toHaveLength(1)
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, 'workspace.delete.request'))).toHaveLength(1)
  })

  it('rejects deletion requests from nonowners and noninteractive identities', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await expect(requestWorkspaceDeletion(userEvent(fixture.ownerId, fixture.workspaceId, 'admin'), fixture.workspaceId, workspace!.slug)).rejects.toMatchObject({ statusCode: 403 })
    await expect(requestWorkspaceDeletion(userEvent(fixture.ownerId, fixture.workspaceId, 'owner', 'api-key'), fixture.workspaceId, workspace!.slug)).rejects.toMatchObject({ statusCode: 403 })
    await expect(requestWorkspaceDeletion(userEvent(fixture.ownerId, fixture.workspaceId, 'owner', 'access-service'), fixture.workspaceId, workspace!.slug)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('maps purging and dependency-blocked statuses', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    await db.update(workspaceDeletionJobs).set({ state: 'purging', lastErrorCode: null }).where(eq(workspaceDeletionJobs.workspaceId, fixture.workspaceId))
    expect(await getWorkspaceDeletionStatus(env, fixture.workspaceId)).toMatchObject({ state: 'purging', errorCode: null })
    await db.update(workspaceDeletionJobs).set({ lastErrorCode: 'dependencies-remain' }).where(eq(workspaceDeletionJobs.workspaceId, fixture.workspaceId))
    expect(await getWorkspaceDeletionStatus(env, fixture.workspaceId)).toMatchObject({ state: 'blocked', errorCode: 'dependencies-remain' })
  })

  it('completes an owner retry without persisting a complete job', async () => {
    const fixture = await ownerWorkspace()
    const [workspace] = await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId)).limit(1)
    await requestWorkspaceDeletion(fixture.event, fixture.workspaceId, workspace!.slug)
    await db.update(workspaceDeletionJobs).set({ storageDrainUntil: new Date(0) }).where(eq(workspaceDeletionJobs.workspaceId, fixture.workspaceId))
    await expect(retryWorkspaceDeletion(env, fixture.workspaceId)).resolves.toEqual({ state: 'complete', errorCode: null, storageDrainUntil: null, updatedAt: null })
    expect(await db.select().from(organizations).where(eq(organizations.id, fixture.workspaceId))).toHaveLength(0)
    expect(await getWorkspaceDeletionStatus(env, fixture.workspaceId)).toBeNull()
    workspaceIds.splice(workspaceIds.indexOf(fixture.workspaceId), 1)
  })
})
