import type { H3Event } from 'h3'
import { env, exports } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { domains, links } from '../../server/database/schema'
import { assignDomainWorkspace, deleteDomain, updateWorkspaceDomain } from '../../server/services/domain'
import { createApiKey, createMembership, createUser, createWorkspace, db, TEST_PNG_BYTES } from '../utils'

interface TenantFixture {
  workspaceId: string
  domainId: string
  hostname: string
  key: string
  linkId: string
}

const fixtures: TenantFixture[] = []

async function createTenant(hostname: string, slug: string, target: string): Promise<TenantFixture> {
  const workspaceId = await createWorkspace()
  const userId = await createUser()
  await createMembership(userId, workspaceId, 'owner')
  const { key } = await createApiKey(workspaceId, userId)
  const domainId = crypto.randomUUID()
  const linkId = crypto.randomUUID().slice(0, 10)
  const now = Math.floor(Date.now() / 1000)
  await db.insert(domains).values({ id: domainId, workspaceId, hostname, status: 'active', isPrimary: true, createdAt: now })
  await db.insert(links).values({ domainId, workspaceId, id: linkId, createdBy: userId, slug, url: target, normalizedUrl: target, createdAt: now, updatedAt: now })
  const fixture = { workspaceId, domainId, hostname, key, linkId }
  fixtures.push(fixture)
  return fixture
}

function request(path: string, key: string, init: RequestInit = {}) {
  return exports.default.fetch(new Request(`http://localhost${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...init.headers },
  }))
}

afterAll(async () => {
  for (const fixture of fixtures) {
    await env.KV.delete(`link:${fixture.domainId}:same-slug`)
    await db.delete(links).where(eq(links.workspaceId, fixture.workspaceId))
    await db.delete(domains).where(eq(domains.workspaceId, fixture.workspaceId))
  }
})

describe('workspace isolation', { concurrent: false }, () => {
  it('resolves the same slug independently on two exact hosts', async () => {
    const a = await createTenant(`a-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://a.example/target')
    const b = await createTenant(`b-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://b.example/target')
    const responseA = await exports.default.fetch(new Request(`https://${a.hostname}/same-slug`, { redirect: 'manual' }))
    const responseB = await exports.default.fetch(new Request(`https://${b.hostname}/same-slug`, { redirect: 'manual' }))
    expect(responseA.headers.get('location')).toBe('https://a.example/target')
    expect(responseB.headers.get('location')).toBe('https://b.example/target')
  })

  it('cannot query, edit, delete, or enumerate another workspace link', async () => {
    const a = await createTenant(`a-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://a.example/private')
    const b = await createTenant(`b-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://b.example/private')
    expect((await request(`/api/link/query?id=${b.linkId}`, a.key)).status).toBe(404)
    expect((await request('/api/link/delete', a.key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.linkId }),
    })).status).toBe(404)
    const list = await (await request('/api/link/list?status=all', a.key)).json() as { links: { id: string }[] }
    expect(list.links.some(link => link.id === b.linkId)).toBe(false)
  })

  it('rejects a workspace header that conflicts with an API key binding', async () => {
    const a = await createTenant(`a-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://a.example')
    const b = await createTenant(`b-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://b.example')
    expect((await request('/api/link/list', a.key, { headers: { 'x-workspace-id': b.workspaceId } })).status).toBe(403)
  })

  it('fails closed for unknown and implicitly aliased hosts', async () => {
    const hostname = `exact-${crypto.randomUUID()}.example.com`
    await createTenant(hostname, 'same-slug', 'https://exact.example/target')
    expect((await exports.default.fetch(new Request(`https://unknown-${hostname}/same-slug`, { redirect: 'manual' }))).status).toBe(404)
    expect((await exports.default.fetch(new Request(`https://www.${hostname}/same-slug`, { redirect: 'manual' }))).status).toBe(404)
    expect((await exports.default.fetch(new Request(`https://${hostname.toUpperCase()}/same-slug`, { redirect: 'manual' }))).headers.get('location')).toBe('https://exact.example/target')
  })

  it('records a bounded cache-drain window when disabling a cached domain', async () => {
    const hostname = `disable-${crypto.randomUUID()}.example.com`
    const fixture = await createTenant(hostname, 'same-slug', 'https://disable.example/target')
    expect((await exports.default.fetch(new Request(`https://${hostname}/same-slug`, { redirect: 'manual' }))).status).toBeGreaterThanOrEqual(300)
    const event = { context: { cloudflare: { env } } } as H3Event
    await updateWorkspaceDomain(event, fixture.workspaceId, fixture.domainId, { status: 'disabled' })
    expect(Number(await env.KV.get(`domain-disabled-at:${fixture.domainId}`))).toBeGreaterThan(0)
    // Another isolate may retain the old active mapping until the hard TTL elapses.
    expect((await exports.default.fetch(new Request(`https://${hostname}/same-slug`, { redirect: 'manual' }))).headers.get('location')).toBe('https://disable.example/target')
  })

  it('requires disable and cache drain before reassignment and removal', async () => {
    const sourceWorkspaceId = await createWorkspace()
    const destinationWorkspaceId = await createWorkspace()
    const id = crypto.randomUUID()
    const hostname = `lifecycle-${crypto.randomUUID()}.example.com`
    const event = { context: { cloudflare: { env } } } as H3Event
    await db.insert(domains).values({ id, workspaceId: sourceWorkspaceId, hostname, status: 'active', isPrimary: false, createdAt: Math.floor(Date.now() / 1000) })
    await expect(assignDomainWorkspace(event, id, destinationWorkspaceId)).rejects.toMatchObject({ statusCode: 409 })
    await updateWorkspaceDomain(event, sourceWorkspaceId, id, { status: 'disabled' })
    await expect(assignDomainWorkspace(event, id, destinationWorkspaceId)).rejects.toMatchObject({ statusCode: 409 })
    await env.KV.put(`domain-disabled-at:${id}`, String(Date.now() - 61_000))
    const linkId = crypto.randomUUID().slice(0, 10)
    const now = Math.floor(Date.now() / 1000)
    await db.insert(links).values({ id: linkId, workspaceId: sourceWorkspaceId, domainId: id, slug: 'owned', url: 'https://example.com', normalizedUrl: 'https://example.com', createdAt: now, updatedAt: now })
    await expect(assignDomainWorkspace(event, id, destinationWorkspaceId)).rejects.toMatchObject({ statusCode: 409 })
    await db.delete(links).where(eq(links.id, linkId))
    expect((await assignDomainWorkspace(event, id, destinationWorkspaceId)).workspaceId).toBe(destinationWorkspaceId)
    await deleteDomain(event, id)
  })

  it('isolates asset mutations while preserving anonymous immutable reads', async () => {
    const a = await createTenant(`asset-a-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://a.example')
    const b = await createTenant(`asset-b-${crypto.randomUUID()}.example.com`, 'same-slug', 'https://b.example')
    const form = new FormData()
    form.set('file', new File([TEST_PNG_BYTES], 'pixel.png', { type: 'image/png' }))
    const uploaded = await request('/api/upload/image', a.key, { method: 'POST', body: form })
    expect(uploaded.status).toBe(200)
    const asset = await uploaded.json() as { key: string, url: string }
    expect(asset.key.startsWith(`uploads/${a.workspaceId}/`)).toBe(true)
    expect((await request('/api/upload/image/delete', b.key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: asset.key }),
    })).status).toBe(404)
    const publicRead = await exports.default.fetch(new Request(`https://${a.hostname}${asset.url}`))
    expect(publicRead.status).toBe(200)
    expect(publicRead.headers.get('cache-control')).toContain('immutable')
    expect((await request('/api/upload/image/delete', a.key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: asset.key }),
    })).status).toBe(200)
    expect((await exports.default.fetch(new Request(`https://${a.hostname}${asset.url}`))).status).toBe(404)
  })

  it('keeps same-workspace slug collisions distinct across all authenticated flows', async () => {
    const workspaceId = await createWorkspace()
    const userId = await createUser()
    await createMembership(userId, workspaceId, 'owner')
    const { key } = await createApiKey(workspaceId, userId)
    const slug = `collision-${crypto.randomUUID()}`
    const now = Math.floor(Date.now() / 1000)
    const domainA = { id: crypto.randomUUID(), hostname: `collision-a-${crypto.randomUUID()}.example.com` }
    const domainB = { id: crypto.randomUUID(), hostname: `collision-b-${crypto.randomUUID()}.example.com` }
    await db.insert(domains).values([
      { ...domainA, workspaceId, status: 'active', isPrimary: true, createdAt: now },
      { ...domainB, workspaceId, status: 'active', isPrimary: false, createdAt: now },
    ])
    const create = async (domainId: string, url: string) => {
      const response = await request('/api/link/create', key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId, slug, url, tags: [domainId.slice(0, 8)] }),
      })
      expect(response.status).toBe(201)
      return await response.json() as { link: { id: string, domainId: string, slug: string, url: string } }
    }
    const a = await create(domainA.id, 'https://a.example/collision')
    const b = await create(domainB.id, 'https://b.example/collision')

    const first = await (await request('/api/link/list?status=all&sort=az&limit=1', key)).json() as { links: { id: string }[], cursor: string }
    const second = await (await request(`/api/link/list?status=all&sort=az&limit=1&cursor=${encodeURIComponent(first.cursor)}`, key)).json() as { links: { id: string }[] }
    expect(new Set([first.links[0]?.id, second.links[0]?.id])).toEqual(new Set([a.link.id, b.link.id]))
    const search = await (await request(`/api/link/search?q=${encodeURIComponent(slug)}`, key)).json() as { id: string, domainId: string }[]
    expect(new Set(search.map(link => link.domainId))).toEqual(new Set([domainA.id, domainB.id]))
    expect((await request(`/api/link/query?id=${a.link.id}`, key)).status).toBe(200)
    expect((await request('/api/link/edit', key, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.link.id, domainId: domainA.id, slug, url: 'https://a.example/edited', tags: [] }),
    })).status).toBe(201)
    expect((await exports.default.fetch(new Request(`https://${domainB.hostname}/${slug}`, { redirect: 'manual' }))).headers.get('location')).toBe('https://b.example/collision')

    expect((await request('/api/backup', key, { method: 'POST' })).status).toBe(200)
    const backups = await env.R2.list({ prefix: `backups/${workspaceId}/manual-links-` })
    expect(backups.objects).toHaveLength(1)
    const backup = await env.R2.get(backups.objects[0]!.key)
    const exported = JSON.parse(await backup!.text()) as { links: { id: string }[] }
    expect(new Set(exported.links.map(link => link.id))).toEqual(new Set([a.link.id, b.link.id]))

    expect((await request('/api/link/delete', key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.link.id }),
    })).status).toBe(204)
    expect((await request(`/api/link/query?id=${a.link.id}`, key)).status).toBe(200)
    expect((await request(`/api/link/query?id=${b.link.id}`, key)).status).toBe(404)
    await env.R2.delete(backups.objects[0]!.key)
    await db.delete(links).where(eq(links.workspaceId, workspaceId))
    await db.delete(domains).where(eq(domains.workspaceId, workspaceId))
  })
})
