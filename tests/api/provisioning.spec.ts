import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs, domains, instanceBootstrap, members, organizations, users, workspaceSettings } from '../../server/database/schema'
import { bootstrapInstance } from '../../server/services/bootstrap'
import { db } from '../utils'

const createdWorkspaceIds: string[] = []
const createdUserIds: string[] = []
let previousAdminIds: string[] = []

function input() {
  return {
    email: `${crypto.randomUUID()}@example.com`,
    password: 'correct-horse-battery-staple',
    name: 'Initial Owner',
    workspaceName: 'Initial Workspace',
    workspaceSlug: `initial-${crypto.randomUUID()}`,
    primaryHostname: 'set.red',
  }
}

afterEach(async () => {
  await db.delete(instanceBootstrap)
  if (createdWorkspaceIds.length) {
    await db.delete(auditLogs).where(inArray(auditLogs.workspaceId, createdWorkspaceIds))
    await db.delete(organizations).where(inArray(organizations.id, createdWorkspaceIds))
  }
  if (createdUserIds.length)
    await db.delete(users).where(inArray(users.id, createdUserIds))
  createdWorkspaceIds.length = 0
  createdUserIds.length = 0
  if (previousAdminIds.length)
    await db.update(users).set({ isInstanceAdmin: true }).where(inArray(users.id, previousAdminIds))
  previousAdminIds = []
})

async function clearExistingAdminFlags() {
  previousAdminIds = (await db.select({ id: users.id }).from(users).where(eq(users.isInstanceAdmin, true))).map(user => user.id)
  if (previousAdminIds.length)
    await db.update(users).set({ isInstanceAdmin: false }).where(inArray(users.id, previousAdminIds))
}

describe('greenfield provisioning', { concurrent: false }, () => {
  it('creates the instance admin, owner workspace, settings, and configured domains', async () => {
    // Existing test fixtures include an instance admin; isolate bootstrap's one-time guard.
    await clearExistingAdminFlags()
    const suffix = crypto.randomUUID().slice(0, 8)
    const configuredHosts = [`one-${suffix}.example.com`, `two-${suffix}.example.com`, `three-${suffix}.example.com`]
    const candidate = { ...input(), primaryHostname: configuredHosts[0] }
    const result = await bootstrapInstance(env, candidate, {
      appHostname: 'app.example.com',
      shortLinkHostnames: configuredHosts.join(','),
    })
    createdWorkspaceIds.push(result.workspaceId)
    createdUserIds.push(result.userId)

    expect(result.domains).toEqual(configuredHosts)
    expect((await db.select().from(users).where(eq(users.id, result.userId)))[0]?.isInstanceAdmin).toBe(true)
    expect((await db.select().from(members).where(eq(members.organizationId, result.workspaceId)))[0]?.role).toBe('owner')
    expect(await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, result.workspaceId))).toHaveLength(1)
    const domainRows = await db.select().from(domains).where(eq(domains.workspaceId, result.workspaceId))
    expect(domainRows).toHaveLength(3)
    expect(domainRows.filter(domain => domain.isPrimary).map(domain => domain.hostname)).toEqual([configuredHosts[0]])

    await expect(bootstrapInstance(env, candidate, {
      appHostname: 'app.example.com',
      shortLinkHostnames: configuredHosts.join(','),
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects invalid host configuration without writing', async () => {
    await clearExistingAdminFlags()
    const hostname = `invalid-${crypto.randomUUID().slice(0, 8)}.example.com`
    const candidate = { ...input(), primaryHostname: hostname }
    await expect(bootstrapInstance(env, candidate, {
      appHostname: hostname,
      shortLinkHostnames: hostname,
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.select().from(users).where(eq(users.email, candidate.email))).toHaveLength(0)
  })

  it('allows only one overlapping bootstrap request to claim the instance', async () => {
    await clearExistingAdminFlags()
    const suffix = crypto.randomUUID().slice(0, 8)
    const configuredHosts = [`race-${suffix}.example.com`]
    const candidates = [input(), input()].map(candidate => ({ ...candidate, primaryHostname: configuredHosts[0] }))
    const attempts = await Promise.allSettled(candidates.map(candidate => bootstrapInstance(env, candidate, {
      appHostname: 'app.example.com',
      shortLinkHostnames: configuredHosts.join(','),
    })))
    const successful = attempts.filter(result => result.status === 'fulfilled')
    const rejected = attempts.filter(result => result.status === 'rejected')
    expect(successful).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 })

    const result = (successful[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof bootstrapInstance>>>).value
    createdWorkspaceIds.push(result.workspaceId)
    createdUserIds.push(result.userId)
    const candidateEmails = candidates.map(candidate => candidate.email.toLowerCase())
    expect(await db.select().from(users).where(inArray(users.email, candidateEmails))).toHaveLength(1)
  })
})
