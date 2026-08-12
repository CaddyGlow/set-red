import type { H3Event } from 'h3'
import type { Compilable } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeAccessLog } from '../../server/utils/access-log'
import { useWAE } from '../../server/utils/cloudflare'

vi.mock('#shared/utils/flag', () => ({ getFlag: vi.fn() }))

const event = {
  context: {
    cloudflare: { env: {} },
    link: { id: 'link-id', workspaceId: 'workspace-id', domainId: 'domain-id' },
  },
} as unknown as H3Event

const query = {} as Compilable

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('writeAccessLog', () => {
  it('silently skips production writes without an Analytics Engine binding', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => writeAccessLog(event, {})).not.toThrow()
  })

  it('writes tenant dimensions using the workspace as the index', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const writeDataPoint = vi.fn()
    const analyticsEvent = {
      context: {
        cloudflare: { env: { ANALYTICS: { writeDataPoint } } },
        link: { id: 'link-id', workspaceId: 'workspace-id', domainId: 'domain-id' },
      },
    } as unknown as H3Event

    writeAccessLog(analyticsEvent, { slug: 'example', url: 'https://example.com' })

    expect(writeDataPoint).toHaveBeenCalledOnce()
    expect(writeDataPoint).toHaveBeenCalledWith(expect.objectContaining({
      indexes: ['workspace-id'],
      blobs: expect.arrayContaining(['link-id', 'domain-id', '2']),
    }))
    expect(writeDataPoint.mock.calls[0]![0].blobs.slice(16)).toEqual(['link-id', 'domain-id', '2'])
  })

  it('does not write events without complete tenant dimensions', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const writeDataPoint = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unscopedEvent = {
      context: {
        cloudflare: { env: { ANALYTICS: { writeDataPoint } } },
        link: { id: 'link-id' },
      },
    } as unknown as H3Event

    writeAccessLog(unscopedEvent, {})

    expect(writeDataPoint).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('access log skipped: link tenant dimensions are missing')
  })
})

describe('useWAE', () => {
  it.each([
    { cfAccountId: '', cfApiToken: 'token' },
    { cfAccountId: 'account', cfApiToken: '' },
  ])('returns empty data without requesting when credentials are incomplete', (config) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('useRuntimeConfig', () => config)
    vi.stubGlobal('$fetch', fetchMock)

    expect(useWAE(event, query)).toEqual({ data: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves requests and propagates errors when credentials are complete', async () => {
    const error = new Error('forbidden')
    const fetchMock = vi.fn().mockRejectedValue(error)
    vi.stubGlobal('useRuntimeConfig', () => ({
      cfAccountId: 'account',
      cfApiToken: 'token',
    }))
    vi.stubGlobal('compileAnalyticsQuery', () => 'select * from sink')
    vi.stubGlobal('$fetch', fetchMock)

    await expect(useWAE(event, query)).rejects.toBe(error)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/analytics_engine/sql',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
        body: 'select * from sink',
        retry: 1,
        retryDelay: 100,
      },
    )
  })
})
