import type { H3Event } from 'h3'
import type { Domain } from '#shared/schemas/domain'
import { and, count, eq, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { domains, links, organizations, workspaceDeletionJobs } from '../database/schema'
import { throwWorkspaceWriteConflict, workspaceWritableCondition } from '../utils/workspace-write'

export const HOST_CACHE_TTL_SECONDS = 60
const isolateHostCache = new Map<string, { domain: Domain | null, expiresAt: number }>()

export function canonicalizeHostname(host: string): string {
  const authority = host.trim().replace(/\.$/, '')
  try {
    return new URL(`http://${authority}`).hostname.toLowerCase().replace(/\.$/, '')
  }
  catch {
    return ''
  }
}

function domainCacheKey(hostname: string): string {
  return `domain:${hostname}`
}

function disabledAtKey(domainId: string): string {
  return `domain-disabled-at:${domainId}`
}

async function assertDomainCacheDrained(event: H3Event, domainId: string): Promise<void> {
  const disabledAt = Number(await event.context.cloudflare.env.KV.get(disabledAtKey(domainId)))
  if (Number.isFinite(disabledAt) && Date.now() - disabledAt < HOST_CACHE_TTL_SECONDS * 1000) {
    throw createError({
      status: 409,
      statusText: `Wait ${HOST_CACHE_TTL_SECONDS} seconds after disabling the domain`,
    })
  }
}

function cacheLocally(hostname: string, domain: Domain | null): void {
  isolateHostCache.set(hostname, { domain, expiresAt: Date.now() + HOST_CACHE_TTL_SECONDS * 1000 })
}

export async function resolveDomainByHost(event: H3Event, host: string): Promise<Domain | null> {
  const hostname = canonicalizeHostname(host)
  if (!hostname)
    return null

  const local = isolateHostCache.get(hostname)
  if (local && local.expiresAt > Date.now())
    return local.domain
  isolateHostCache.delete(hostname)

  const cacheKey = domainCacheKey(hostname)
  const cached = await event.context.cloudflare.env.KV.get(cacheKey, { type: 'json', cacheTtl: HOST_CACHE_TTL_SECONDS }) as Domain | null
  if (cached?.hostname === hostname) {
    cacheLocally(hostname, cached)
    return cached
  }

  const db = drizzle(event.context.cloudflare.env.DB)
  const [row] = await db.select().from(domains).where(eq(domains.hostname, hostname)).limit(1)
  const domain = row as Domain | undefined
  if (!domain) {
    cacheLocally(hostname, null)
    return null
  }

  await event.context.cloudflare.env.KV.put(cacheKey, JSON.stringify(domain), { expirationTtl: HOST_CACHE_TTL_SECONDS })
  cacheLocally(hostname, domain)
  return domain
}

export async function invalidateDomainCache(event: H3Event, hostname: string): Promise<void> {
  const canonical = canonicalizeHostname(hostname)
  isolateHostCache.delete(canonical)
  await event.context.cloudflare.env.KV.delete(domainCacheKey(canonical))
}

export async function listWorkspaceDomains(event: H3Event, workspaceId: string): Promise<Domain[]> {
  return await drizzle(event.context.cloudflare.env.DB).select().from(domains).where(eq(domains.workspaceId, workspaceId)) as Domain[]
}

export async function getWorkspaceDomain(event: H3Event, workspaceId: string, domainId: string, activeOnly = false): Promise<Domain | null> {
  const [domain] = await drizzle(event.context.cloudflare.env.DB).select().from(domains).where(and(
    eq(domains.id, domainId),
    eq(domains.workspaceId, workspaceId),
    activeOnly ? eq(domains.status, 'active') : undefined,
  )).limit(1)
  return domain as Domain | undefined ?? null
}

export async function createDomain(event: H3Event, values: Omit<Domain, 'createdAt'>): Promise<Domain> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const hostname = canonicalizeHostname(values.hostname)
  const createdAt = Math.floor(Date.now() / 1000)
  const [created] = await db.insert(domains).select(db.select({
    id: sql<string>`${values.id}`.as('id'),
    workspaceId: organizations.id,
    hostname: sql<string>`${hostname}`.as('hostname'),
    status: sql<Domain['status']>`${values.status}`.as('status'),
    isPrimary: sql<boolean>`${values.isPrimary}`.as('isPrimary'),
    notFoundRedirect: sql<string | null>`${values.notFoundRedirect ?? null}`.as('notFoundRedirect'),
    homeUrl: sql<string | null>`${values.homeUrl ?? null}`.as('homeUrl'),
    createdAt: sql<number>`${createdAt}`.as('createdAt'),
  }).from(organizations).where(and(
    eq(organizations.id, values.workspaceId),
    workspaceWritableCondition(db, values.workspaceId),
  ))).onConflictDoNothing().returning()
  if (!created) {
    const [deletion] = await db.select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, values.workspaceId)).limit(1)
    if (deletion)
      throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
    throw createError({ status: 409, statusText: 'Domain already exists' })
  }
  await invalidateDomainCache(event, hostname)
  return created as Domain
}

export async function updateWorkspaceDomain(event: H3Event, workspaceId: string, domainId: string, values: Partial<Pick<Domain, 'status' | 'isPrimary' | 'notFoundRedirect' | 'homeUrl'>>): Promise<Domain> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const current = await getWorkspaceDomain(event, workspaceId, domainId)
  if (!current)
    throw createError({ status: 404, statusText: 'Domain not found' })

  if (values.isPrimary) {
    await db.update(domains).set({ isPrimary: false }).where(and(
      eq(domains.workspaceId, workspaceId),
      ne(domains.id, domainId),
      workspaceWritableCondition(db, workspaceId),
    ))
  }

  const [updated] = await db.update(domains).set(values).where(and(
    eq(domains.id, domainId),
    eq(domains.workspaceId, workspaceId),
    workspaceWritableCondition(db, workspaceId),
  )).returning()
  if (!updated)
    await throwWorkspaceWriteConflict(db, workspaceId, 'Domain write conflict')
  if (current.status === 'active' && values.status === 'disabled') {
    await event.context.cloudflare.env.KV.put(disabledAtKey(domainId), String(Date.now()), {
      expirationTtl: HOST_CACHE_TTL_SECONDS * 2,
    })
  }
  else if (values.status === 'active') {
    await event.context.cloudflare.env.KV.delete(disabledAtKey(domainId))
  }
  await invalidateDomainCache(event, current.hostname)
  return updated as Domain
}

export async function assignDomainWorkspace(event: H3Event, domainId: string, workspaceId: string): Promise<Domain> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1)
  if (!domain)
    throw createError({ status: 404, statusText: 'Domain not found' })
  if (domain.status !== 'disabled')
    throw createError({ status: 409, statusText: 'Disable the domain before reassigning it' })
  await assertDomainCacheDrained(event, domainId)
  const [usage] = await db.select({ count: count() }).from(links).where(eq(links.domainId, domainId))
  if ((usage?.count ?? 0) > 0)
    throw createError({ status: 409, statusText: 'A domain with links cannot be reassigned' })
  const [updated] = await db.update(domains).set({ workspaceId, isPrimary: false }).where(and(
    eq(domains.id, domainId),
    workspaceWritableCondition(db, domain.workspaceId),
    workspaceWritableCondition(db, workspaceId),
  )).returning()
  if (!updated) {
    const [sourceDeletion] = await db.select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, domain.workspaceId)).limit(1)
    if (sourceDeletion)
      throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
    await throwWorkspaceWriteConflict(db, workspaceId, 'Domain write conflict')
  }
  await invalidateDomainCache(event, domain.hostname)
  return updated as Domain
}

export async function deleteDomain(event: H3Event, domainId: string): Promise<Domain> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1)
  if (!domain)
    throw createError({ status: 404, statusText: 'Domain not found' })
  if (domain.status !== 'disabled')
    throw createError({ status: 409, statusText: 'Disable the domain before removing it' })
  await assertDomainCacheDrained(event, domainId)
  const [usage] = await db.select({ count: count() }).from(links).where(eq(links.domainId, domainId))
  if ((usage?.count ?? 0) > 0)
    throw createError({ status: 409, statusText: 'A domain with links cannot be removed' })
  const [deleted] = await db.delete(domains).where(and(
    eq(domains.id, domainId),
    workspaceWritableCondition(db, domain.workspaceId),
  )).returning({ id: domains.id })
  if (!deleted)
    await throwWorkspaceWriteConflict(db, domain.workspaceId, 'Domain write conflict')
  await Promise.all([
    invalidateDomainCache(event, domain.hostname),
    event.context.cloudflare.env.KV.delete(disabledAtKey(domainId)),
  ])
  return domain as Domain
}
