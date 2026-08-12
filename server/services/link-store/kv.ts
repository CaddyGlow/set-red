import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import { StoredLinkSchema } from '#shared/schemas/link'
import { getExpiration } from '../../utils/time'

export interface LinkCacheResult {
  link: Link | null
  metadata: Record<string, unknown> | null
}

function cacheKey(domainId: string, slug: string): string {
  return `link:${domainId}:${slug}`
}

function isActiveExpiration(expiration: number | null | undefined): boolean {
  return expiration === null || expiration === undefined || expiration > Math.floor(Date.now() / 1000)
}

function logCacheError(operation: string, domainId: string, slug: string, error: unknown): void {
  console.error({
    event: 'link_cache.operation.failed',
    operation,
    domainId,
    slug,
    error: error instanceof Error ? error.message : String(error),
  })
}

export async function readLinkCache(event: H3Event, domainId: string, slug: string, cacheTtl?: number): Promise<LinkCacheResult> {
  try {
    const result = await event.context.cloudflare.env.KV.getWithMetadata(cacheKey(domainId, slug), { type: 'json', cacheTtl })
    const parsed = StoredLinkSchema.safeParse(result.value)
    const metadata = result.metadata as Record<string, unknown> | null
    const metadataExpiration = typeof metadata?.expiration === 'number' ? metadata.expiration : undefined
    if (!parsed.success || parsed.data.domainId !== domainId || parsed.data.slug !== slug)
      return { link: null, metadata }
    if (!isActiveExpiration(metadataExpiration ?? parsed.data.expiration))
      return { link: null, metadata }
    return { link: parsed.data, metadata }
  }
  catch (error) {
    logCacheError('get', domainId, slug, error)
    return { link: null, metadata: null }
  }
}

export async function putLinkCache(event: H3Event, link: Link, effectiveExpiresAt?: number | null): Promise<boolean> {
  const expiration = effectiveExpiresAt === undefined ? getExpiration(event, link.expiration) : effectiveExpiresAt ?? undefined
  try {
    await event.context.cloudflare.env.KV.put(cacheKey(link.domainId, link.slug), JSON.stringify(link), { expiration })
    return true
  }
  catch (error) {
    logCacheError('put', link.domainId, link.slug, error)
    return false
  }
}

export async function deleteLinkCache(event: H3Event, domainId: string, slug: string): Promise<void> {
  try {
    await event.context.cloudflare.env.KV.delete(cacheKey(domainId, slug))
  }
  catch (error) {
    logCacheError('delete', domainId, slug, error)
  }
}

export function isActiveLinkExpiration(expiration: number | null | undefined): boolean {
  return isActiveExpiration(expiration)
}
