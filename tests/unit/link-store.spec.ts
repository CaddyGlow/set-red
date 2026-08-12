import type { H3Event } from 'h3'
import type { Link } from '../../shared/schemas/link'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLinks } from '../../server/utils/link-store'

const mocks = vi.hoisted(() => ({
  d1CreateLinks: vi.fn(),
  d1GetActiveLinkVersions: vi.fn(),
  deleteLinkCache: vi.fn(),
  putLinkCache: vi.fn(),
}))

vi.mock('../../server/services/link-store/d1', () => ({
  d1CountLinks: vi.fn(),
  d1CreateLink: vi.fn(),
  d1CreateLinks: mocks.d1CreateLinks,
  d1DeleteLink: vi.fn(),
  d1GetActiveLinkBySlug: vi.fn(),
  d1GetActiveLinkVersions: mocks.d1GetActiveLinkVersions,
  d1GetAnyLink: vi.fn(),
  d1GetLinkWithMetadata: vi.fn(),
  d1HasActiveLinkVersion: vi.fn(),
  d1IterateAllLinks: vi.fn(),
  d1ListLinks: vi.fn(),
  d1ListTags: vi.fn(),
  d1SearchLinks: vi.fn(),
  d1UpdateLink: vi.fn(),
}))

vi.mock('../../server/services/domain', () => ({
  getWorkspaceDomain: vi.fn().mockResolvedValue({ hostname: 'set.red' }),
}))

vi.mock('../../server/services/link-store/kv', () => ({
  deleteLinkCache: mocks.deleteLinkCache,
  isActiveLinkExpiration: () => true,
  putLinkCache: mocks.putLinkCache,
  readLinkCache: vi.fn(),
}))

describe('createLinks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('keeps D1 success when post-write cache verification fails', async () => {
    const link: Link = {
      domainId: 'domain-id',
      workspaceId: 'workspace-id',
      id: 'bulk-id',
      slug: 'bulk-success',
      url: 'https://example.com',
      createdAt: 1,
      updatedAt: 1,
      tags: [],
    }
    mocks.d1CreateLinks.mockResolvedValue([{ created: true, effectiveExpiresAt: null }])
    mocks.putLinkCache.mockResolvedValue(true)
    mocks.d1GetActiveLinkVersions.mockRejectedValue(new Error('version query failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const event = { context: { auth: { workspaceId: 'workspace-id' } } } as H3Event
    await expect(createLinks(event, [link])).resolves.toEqual([{ created: true }])

    expect(mocks.d1CreateLinks).toHaveBeenCalledOnce()
    expect(mocks.deleteLinkCache).toHaveBeenCalledWith(expect.anything(), link.domainId, link.slug)
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ operation: 'bulk-write-through' }))
  })
})
