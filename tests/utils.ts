import type { Role } from '../shared/auth/permissions'
import type { Link } from '../shared/schemas/link'
import { defaultKeyHasher } from '@better-auth/api-key'
import { env, exports } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { expect } from 'vitest'
import { apiKeys, domains, links, linkTombstones, members, organizations, users, workspaceSettings } from '../server/database/schema'
import { permissionsForRole, permissionsToStatement } from '../shared/auth/permissions'
import { LINK_PASSWORD_HASH_PREFIX, LINK_PASSWORD_MASK_PREFIX } from '../shared/utils/link-password'

export const db = drizzle(env.DB)
export const TEST_USER_ID = 'test-owner-user'
export const TEST_WORKSPACE_ID = 'test-workspace'
export const TEST_DOMAIN_ID = 'test-domain-set-red'
export const TEST_HOSTNAME = 'set.red'
const TEST_API_KEY = `test_${'a'.repeat(64)}`
let fixturePromise: Promise<void> | undefined

export function ensureTenantFixture(): Promise<void> {
  fixturePromise ??= (async () => {
    const now = new Date()
    await db.insert(users).values({ id: TEST_USER_ID, name: 'Test Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now, isInstanceAdmin: true }).onConflictDoNothing()
    await db.insert(organizations).values({ id: TEST_WORKSPACE_ID, name: 'Test Workspace', slug: 'test-workspace', createdAt: now }).onConflictDoNothing()
    await db.insert(members).values({ id: 'test-owner-member', userId: TEST_USER_ID, organizationId: TEST_WORKSPACE_ID, role: 'owner', createdAt: now }).onConflictDoNothing()
    await db.insert(workspaceSettings).values({ workspaceId: TEST_WORKSPACE_ID }).onConflictDoNothing()
    await db.insert(domains).values({ id: TEST_DOMAIN_ID, workspaceId: TEST_WORKSPACE_ID, hostname: TEST_HOSTNAME, status: 'active', isPrimary: true, createdAt: Math.floor(Date.now() / 1000) }).onConflictDoNothing()
    await db.insert(apiKeys).values({
      id: 'test-owner-api-key',
      configId: 'workspace',
      name: 'Test key',
      start: TEST_API_KEY.slice(0, 6),
      referenceId: TEST_WORKSPACE_ID,
      key: await defaultKeyHasher(TEST_API_KEY),
      enabled: true,
      rateLimitEnabled: false,
      permissions: JSON.stringify(permissionsToStatement(permissionsForRole('owner'))),
      metadata: JSON.stringify({ creatorUserId: TEST_USER_ID, independentService: false }),
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing()
  })()
  return fixturePromise
}

export async function createWorkspace(name = `Workspace ${crypto.randomUUID()}`) {
  const id = crypto.randomUUID()
  await db.insert(organizations).values({ id, name, slug: `workspace-${crypto.randomUUID()}`, createdAt: new Date() })
  await db.insert(workspaceSettings).values({ workspaceId: id })
  return id
}

export async function createUser(email = `${crypto.randomUUID()}@example.com`) {
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(users).values({ id, name: 'Test User', email, emailVerified: true, createdAt: now, updatedAt: now, isInstanceAdmin: false })
  return id
}

export async function createMembership(userId: string, organizationId: string, role: Role) {
  const id = crypto.randomUUID()
  await db.insert(members).values({ id, userId, organizationId, role, createdAt: new Date() })
  return id
}

export async function createApiKey(organizationId: string, userId: string, role: Role = 'owner') {
  const id = crypto.randomUUID()
  const key = `test_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
  const now = new Date()
  await db.insert(apiKeys).values({
    id,
    configId: 'workspace',
    name: 'Fixture key',
    start: key.slice(0, 6),
    referenceId: organizationId,
    key: await defaultKeyHasher(key),
    enabled: true,
    rateLimitEnabled: false,
    permissions: JSON.stringify(permissionsToStatement(permissionsForRole(role))),
    metadata: JSON.stringify({ creatorUserId: userId, independentService: false }),
    createdAt: now,
    updatedAt: now,
  })
  return { id, key }
}

export async function withRole(role: Role) {
  const workspaceId = await createWorkspace()
  const userId = await createUser()
  await createMembership(userId, workspaceId, role)
  const apiKey = await createApiKey(workspaceId, userId, role)
  return { workspaceId, userId, apiKey }
}

export async function fetchWithAuth(path: string, options?: RequestInit): Promise<Response> {
  await ensureTenantFixture()
  const request = new Request(`http://localhost${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${TEST_API_KEY}`,
    },
  })
  return exports.default.fetch(request)
}

export function fetch(path: string, options?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`http://localhost${path}`, options))
}

export async function postJson(path: string, body: unknown, withAuth = true): Promise<Response> {
  const fn = withAuth ? fetchWithAuth : fetch
  let requestBody = body
  if (body && typeof body === 'object' && ['/api/link/create', '/api/link/upsert'].includes(path))
    requestBody = { domainId: TEST_DOMAIN_ID, ...body }
  if (body && typeof body === 'object' && path === '/api/link/import' && 'links' in body && Array.isArray(body.links))
    requestBody = { ...body, links: body.links.map(link => ({ domainId: TEST_DOMAIN_ID, ...link })) }
  if (body && typeof body === 'object' && path === '/api/link/delete' && 'slug' in body && typeof body.slug === 'string' && body.slug) {
    const stored = await getD1Link(body.slug)
    requestBody = { id: stored?.id ?? 'missing-link-id' }
  }
  return await fn(path, {
    method: 'POST',
    body: JSON.stringify(requestBody),
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function putJson(path: string, body: unknown, withAuth = true): Promise<Response> {
  const fn = withAuth ? fetchWithAuth : fetch
  let requestBody = body
  if (body && typeof body === 'object' && path === '/api/link/edit') {
    const slug = 'slug' in body && typeof body.slug === 'string' ? body.slug : ''
    const stored = slug ? await getD1Link(slug) : null
    requestBody = { domainId: TEST_DOMAIN_ID, ...(slug ? { id: stored?.id ?? 'missing-link-id' } : {}), ...body }
  }
  return await fn(path, {
    method: 'PUT',
    body: JSON.stringify(requestBody),
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function getStoredLink(slug: string) {
  return await env.KV.get<Link>(`link:${TEST_DOMAIN_ID}:${slug}`, { type: 'json' })
}

export async function getD1Link(slug: string) {
  const [link] = await db.select().from(links).where(and(eq(links.domainId, TEST_DOMAIN_ID), eq(links.slug, slug))).limit(1)
  return link ?? null
}

export async function deleteStoredLink(slug: string) {
  await Promise.all([
    env.KV.delete(`link:${TEST_DOMAIN_ID}:${slug}`),
    db.delete(links).where(and(eq(links.domainId, TEST_DOMAIN_ID), eq(links.slug, slug))),
    db.delete(linkTombstones).where(and(eq(linkTombstones.domainId, TEST_DOMAIN_ID), eq(linkTombstones.slug, slug))),
  ])
}

export async function deleteStoredLinks(slugs: string[]) {
  await Promise.all(slugs.map(slug => deleteStoredLink(slug)))
}

export async function clearLinkMigrationState() {
  await ensureTenantFixture()
}

export async function setLinkStoreD1Mode() {
  await ensureTenantFixture()
}

export function expectMaskedPassword(password: string | undefined, plainText: string) {
  expect(password).toBeDefined()
  expect(password?.startsWith(LINK_PASSWORD_MASK_PREFIX), password).toBe(true)
  expect(password).toContain(plainText.slice(-3))
  expect(password).not.toBe(plainText)
  expect(password?.startsWith(LINK_PASSWORD_HASH_PREFIX)).toBe(false)
}

export async function expectStoredHashedPassword(slug: string, plainText: string) {
  const storedLink = await getStoredLink(slug)
  expect(storedLink?.password?.startsWith(LINK_PASSWORD_HASH_PREFIX), storedLink?.password).toBe(true)
  expect(storedLink?.password).not.toBe(plainText)
}

// 1x1 transparent PNG for testing
export const TEST_PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0A,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0D,
  0x0A,
  0x2D,
  0xB4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
])
