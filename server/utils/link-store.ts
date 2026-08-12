import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import type { LinkSearchItem } from '#shared/types/link'
import type { ExpectedLinkVersion, LinkFilterOptions, LinkScope, ListLinksOptions, ListLinksResult, SearchLinksOptions } from '../services/link-store/d1'
import { getRequestProtocol } from 'h3'
import { getWorkspaceDomain } from '../services/domain'
import {
  d1CountLinks,
  d1CreateLink,
  d1CreateLinks,
  d1DeleteLink,
  d1GetActiveLinkBySlug,
  d1GetActiveLinkVersions,
  d1GetAnyLink,
  d1GetLinkWithMetadata,
  d1HasActiveLinkVersion,
  d1IterateAllLinks,
  d1ListLinks,
  d1ListTags,
  d1SearchLinks,
  d1UpdateLink,
} from '../services/link-store/d1'
import { deleteLinkCache, isActiveLinkExpiration, putLinkCache, readLinkCache } from '../services/link-store/kv'

export function getLinkScope(event: H3Event, domainId?: string): LinkScope {
  const workspaceId = event.context.auth?.workspaceId
  if (!workspaceId)
    throw createError({ status: 403, statusText: 'An active workspace is required' })
  return { workspaceId, ...(domainId ? { domainId } : {}) }
}

export function normalizeSlug(event: H3Event, slug: string): string {
  const caseSensitive = event.context.workspaceSettings?.caseSensitive ?? useRuntimeConfig(event).caseSensitive
  return caseSensitive ? slug : slug.toLowerCase()
}

export async function buildShortLink(event: H3Event, link: Pick<Link, 'domainId' | 'workspaceId' | 'slug'>): Promise<string> {
  const domain = 'domain' in link && typeof link.domain === 'string'
    ? { hostname: link.domain }
    : await getWorkspaceDomain(event, link.workspaceId, link.domainId)
  if (!domain)
    throw createError({ status: 500, statusText: 'Link domain is unavailable' })
  return `${getRequestProtocol(event)}://${domain.hostname}/${link.slug}`
}

async function writeThroughCache(event: H3Event, scope: LinkScope, link: Link, effectiveExpiresAt?: number | null): Promise<void> {
  if (!isActiveLinkExpiration(effectiveExpiresAt)) {
    await deleteLinkCache(event, link.domainId, link.slug)
    return
  }
  if (!await putLinkCache(event, link, effectiveExpiresAt))
    return
  if (!await d1HasActiveLinkVersion(event, scope, link))
    await deleteLinkCache(event, link.domainId, link.slug)
}

export async function getLink(event: H3Event, scope: Required<LinkScope>, slug: string, cacheTtl?: number): Promise<Link | null> {
  const cached = await readLinkCache(event, scope.domainId, slug, cacheTtl)
  if (cached.link && cached.link.workspaceId === scope.workspaceId)
    return cached.link
  const stored = await d1GetActiveLinkBySlug(event, scope, slug)
  if (!stored)
    return null
  await writeThroughCache(event, scope, stored.link, stored.effectiveExpiresAt)
  return stored.link
}

export async function getAuthoritativeLink(event: H3Event, id: string): Promise<Link | null> {
  const scope = getLinkScope(event)
  const link = await d1GetAnyLink(event, scope, id)
  if (!link)
    return null
  return (await d1HasActiveLinkVersion(event, scope, link)) ? link : null
}

export async function getAuthoritativeLinkBySlug(event: H3Event, domainId: string, slug: string): Promise<Link | null> {
  const scope = getLinkScope(event, domainId) as Required<LinkScope>
  return (await d1GetActiveLinkBySlug(event, scope, slug))?.link ?? null
}

export async function getAnyAuthoritativeLink(event: H3Event, id: string): Promise<Link | null> {
  return await d1GetAnyLink(event, getLinkScope(event), id)
}

export async function getLinkWithMetadata(event: H3Event, id: string): Promise<{ link: Link | null, metadata: Record<string, unknown> | null }> {
  return await d1GetLinkWithMetadata(event, getLinkScope(event), id)
}

export async function createLink(event: H3Event, link: Link): Promise<boolean> {
  const scope = getLinkScope(event, link.domainId)
  const domain = await getWorkspaceDomain(event, scope.workspaceId, link.domainId, true)
  if (!domain)
    throw createError({ status: 400, statusText: 'Domain is not active in this workspace' })
  link.domain = domain.hostname
  const result = await d1CreateLink(event, scope, link)
  if (!result.created)
    return false
  await writeThroughCache(event, scope, link, result.effectiveExpiresAt)
  return true
}

export type CreateLinksResult = { created: boolean } | { error: unknown }

function isWorkspaceDeletionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null)
    return false
  const candidate = error as { statusCode?: unknown, statusMessage?: unknown, message?: unknown }
  return (candidate.statusCode === 409 && candidate.statusMessage === 'Workspace deletion is in progress')
    || (typeof candidate.message === 'string' && candidate.message.toLowerCase().includes('workspace deletion is in progress'))
}

async function writeThroughCaches(event: H3Event, scope: LinkScope, successful: { link: Link, effectiveExpiresAt: number | null }[]): Promise<void> {
  const cached = (await Promise.all(successful.map(async ({ link, effectiveExpiresAt }) => {
    if (!isActiveLinkExpiration(effectiveExpiresAt)) {
      await deleteLinkCache(event, link.domainId, link.slug)
      return null
    }
    return await putLinkCache(event, link, effectiveExpiresAt) ? link : null
  }))).filter(link => link !== null)
  const currentIds = await d1GetActiveLinkVersions(event, scope, cached)
  await Promise.all(cached.map(async (link) => {
    if (!currentIds.has(link.id))
      await deleteLinkCache(event, link.domainId, link.slug)
  }))
}

export async function createLinks(event: H3Event, importedLinks: Link[]): Promise<CreateLinksResult[]> {
  const scope = getLinkScope(event)
  for (const link of importedLinks) {
    const domain = await getWorkspaceDomain(event, scope.workspaceId, link.domainId, true)
    if (!domain)
      throw createError({ status: 400, statusText: 'Domain is not active in this workspace' })
    link.domain = domain.hostname
  }
  let results: Awaited<ReturnType<typeof d1CreateLinks>>
  try {
    results = await d1CreateLinks(event, scope, importedLinks)
  }
  catch (error) {
    if (isWorkspaceDeletionConflict(error))
      throw error
    const fallbackResults: CreateLinksResult[] = []
    for (const link of importedLinks) {
      try {
        fallbackResults.push({ created: await createLink(event, link) })
      }
      catch (error) {
        if (isWorkspaceDeletionConflict(error))
          throw error
        fallbackResults.push({ error })
      }
    }
    return fallbackResults
  }
  const successful = results.flatMap((result, index) => result.created ? [{ link: importedLinks[index]!, effectiveExpiresAt: result.effectiveExpiresAt }] : [])
  try {
    await writeThroughCaches(event, scope, successful)
  }
  catch (error) {
    console.error({ event: 'link_cache.operation.failed', operation: 'bulk-write-through', ids: successful.map(item => item.link.id), error: error instanceof Error ? error.message : String(error) })
    await Promise.all(successful.map(item => deleteLinkCache(event, item.link.domainId, item.link.slug)))
  }
  return results.map(result => ({ created: result.created }))
}

export async function updateLink(event: H3Event, link: Link, expected?: ExpectedLinkVersion): Promise<boolean> {
  const scope = getLinkScope(event)
  const result = await d1UpdateLink(event, scope, link, expected)
  if (!result.updated)
    return false
  if (result.previous && (result.previous.domainId !== link.domainId || result.previous.slug !== link.slug))
    await deleteLinkCache(event, result.previous.domainId, result.previous.slug)
  await writeThroughCache(event, scope, link, result.effectiveExpiresAt)
  return true
}

export async function deleteLink(event: H3Event, id: string): Promise<boolean> {
  const deleted = await d1DeleteLink(event, getLinkScope(event), id)
  if (!deleted)
    return false
  await deleteLinkCache(event, deleted.domainId, deleted.slug)
  return true
}

export async function listLinks(event: H3Event, options: ListLinksOptions): Promise<ListLinksResult> {
  return await d1ListLinks(event, getLinkScope(event), options)
}

export function iterateAllAuthoritativeLinks(env: Cloudflare.Env, workspaceId: string): AsyncIterable<Link> {
  return d1IterateAllLinks(env, { workspaceId })
}

export async function searchLinks(event: H3Event, options: SearchLinksOptions): Promise<LinkSearchItem[]> {
  return await d1SearchLinks(event, getLinkScope(event), options)
}

export async function countLinks(event: H3Event, options: LinkFilterOptions): Promise<number> {
  return await d1CountLinks(event, getLinkScope(event), options)
}

export async function listTags(event: H3Event): Promise<{ name: string, count: number }[]> {
  return await d1ListTags(event, getLinkScope(event))
}
