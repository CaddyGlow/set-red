import { and, eq, inArray } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLogs } from '../../server/database/schema'
import { db, deleteStoredLinks, getD1Link, postJson, putJson, TEST_WORKSPACE_ID } from '../utils'

const actions = ['link.create', 'link.update', 'link.import', 'link.delete']
const slugs: string[] = []

afterEach(async () => {
  await deleteStoredLinks(slugs)
  slugs.length = 0
  await db.delete(auditLogs).where(and(
    eq(auditLogs.workspaceRef, TEST_WORKSPACE_ID),
    inArray(auditLogs.action, actions),
  ))
})

describe('link mutation audit', { concurrent: false }, () => {
  it('records create, edit, upsert, import, and delete mutations', async () => {
    const createSlug = `audit-create-${crypto.randomUUID()}`
    const upsertSlug = `audit-upsert-${crypto.randomUUID()}`
    const importSlug = `audit-import-${crypto.randomUUID()}`
    slugs.push(createSlug, upsertSlug, importSlug)

    const createdResponse = await postJson('/api/link/create', { slug: createSlug, url: 'https://example.com/create' })
    expect(createdResponse.status).toBe(201)
    const created = await getD1Link(createSlug)
    expect(created).not.toBeNull()

    const editedResponse = await putJson('/api/link/edit', {
      id: created!.id,
      domainId: created!.domainId,
      slug: createSlug,
      url: 'https://example.com/edited',
    })
    expect(editedResponse.status).toBe(201)

    expect((await postJson('/api/link/upsert', { slug: upsertSlug, url: 'https://example.com/upsert' })).status).toBe(201)
    const upserted = await getD1Link(upsertSlug)
    expect(upserted).not.toBeNull()
    const importedResponse = await postJson('/api/link/import', {
      version: '1.0',
      links: [{ slug: importSlug, url: 'https://example.com/import' }],
    })
    expect(importedResponse.status).toBe(200)
    expect(await importedResponse.json()).toMatchObject({ success: 1 })

    expect((await postJson('/api/link/delete', { id: created!.id })).status).toBe(204)

    const entries = await db.select({ action: auditLogs.action, targetId: auditLogs.targetId, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.workspaceRef, TEST_WORKSPACE_ID),
        inArray(auditLogs.action, actions),
        inArray(auditLogs.targetId, [created!.id, upserted!.id, TEST_WORKSPACE_ID]),
      ))
    expect(entries.filter(entry => entry.action === 'link.create')).toHaveLength(2)
    expect(entries.filter(entry => entry.action === 'link.update')).toEqual([
      expect.objectContaining({ targetId: created!.id }),
    ])
    expect(entries.filter(entry => entry.action === 'link.import')).toEqual([
      expect.objectContaining({ targetId: TEST_WORKSPACE_ID, metadata: { importedCount: 1 } }),
    ])
    expect(entries.filter(entry => entry.action === 'link.delete')).toEqual([
      expect.objectContaining({ targetId: created!.id }),
    ])
  })
})
