import type { BatchItem } from 'drizzle-orm/batch'
import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import type { LinkSearchItem, LinkSortBy, LinkStatus } from '#shared/types/link'
import { and, asc, count, desc, eq, exists, gt, inArray, isNotNull, isNull, lt, lte, notExists, or, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { parseURL, stringifyParsedURL } from 'ufo'
import { domains, links, linkTags, linkTombstones, organizations, tags, workspaceDeletionJobs } from '../../database/schema'
import { getExpiration } from '../../utils/time'

const D1_CURSOR_PREFIX = 'd1:v2:'
const SQL_BATCH_SIZE = 90

type LinkRow = typeof links.$inferSelect

export interface LinkScope {
  workspaceId: string
  domainId?: string
}

export interface ExpectedLinkVersion {
  updatedAt: number
}

export interface ListLinksOptions {
  limit: number
  cursor?: string
  sort?: LinkSortBy
  tag?: string
  status?: LinkStatus
  domainId?: string
}

export interface ListLinksResult {
  links: Link[]
  list_complete: boolean
  cursor?: string
}

export interface LinkFilterOptions {
  q?: string
  url?: string
  tag?: string
  status?: LinkStatus
  domainId?: string
}

export interface SearchLinksOptions extends LinkFilterOptions {
  limit?: number
}

interface D1Cursor {
  sort: LinkSortBy
  id: string
  slug: string
  createdAt?: number
  tag?: string
  status: LinkStatus
  domainId?: string
}

function withoutQuery(url: string): string {
  const parsed = parseURL(url)
  return stringifyParsedURL({ ...parsed, search: '' })
}

function getDatabase(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB)
}

function scopeCondition(scope: LinkScope) {
  return and(
    eq(links.workspaceId, scope.workspaceId),
    scope.domainId ? eq(links.domainId, scope.domainId) : undefined,
  )
}

function workspaceWritableCondition(db: ReturnType<typeof getDatabase>, workspaceId: string) {
  return notExists(db.select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)))
}

function activeCondition(now = Math.floor(Date.now() / 1000)) {
  return or(isNull(links.effectiveExpiresAt), gt(links.effectiveExpiresAt, now))
}

function statusCondition(status: LinkStatus, now = Math.floor(Date.now() / 1000)) {
  if (status === 'active')
    return activeCondition(now)
  if (status === 'expired')
    return and(isNotNull(links.effectiveExpiresAt), lte(links.effectiveExpiresAt, now))
  return undefined
}

function exactTagCondition(db: ReturnType<typeof getDatabase>, workspaceId: string, tag?: string) {
  return tag
    ? exists(db.select({ linkId: linkTags.linkId }).from(linkTags).where(and(
        eq(linkTags.workspaceId, workspaceId),
        eq(linkTags.linkId, links.id),
        eq(linkTags.tagName, tag),
      )))
    : undefined
}

function rowToLink(row: LinkRow): Link {
  const link: Link = {
    id: row.id,
    workspaceId: row.workspaceId,
    domainId: row.domainId,
    createdBy: row.createdBy,
    url: row.url,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: [],
  }
  const optionalFields = [
    'comment',
    'expiration',
    'title',
    'description',
    'image',
    'apple',
    'google',
    'cloaking',
    'redirectWithQuery',
    'password',
    'unsafe',
    'geo',
  ] as const
  for (const field of optionalFields) {
    const value = row[field]
    if (value !== null)
      Object.assign(link, { [field]: value })
  }
  return link
}

async function addTagsToLinksFromDatabase<T extends { id: string, tags: string[] }>(db: ReturnType<typeof getDatabase>, workspaceId: string, result: T[]): Promise<T[]> {
  const byId = new Map(result.map(link => [link.id, link]))
  const ids = [...byId.keys()]
  for (let offset = 0; offset < ids.length; offset += SQL_BATCH_SIZE) {
    const rows = await db.select({ linkId: linkTags.linkId, tag: linkTags.tagName }).from(linkTags).where(and(
      eq(linkTags.workspaceId, workspaceId),
      inArray(linkTags.linkId, ids.slice(offset, offset + SQL_BATCH_SIZE)),
    )).orderBy(asc(linkTags.tagName))
    for (const row of rows)
      byId.get(row.linkId)?.tags.push(row.tag)
  }
  return result
}

async function rowsToLinks(event: H3Event, workspaceId: string, rows: LinkRow[]): Promise<Link[]> {
  const db = getDatabase(event)
  const result = rows.map(rowToLink)
  const domainIds = [...new Set(result.map(link => link.domainId))]
  if (domainIds.length) {
    const domainRows = await db.select({ id: domains.id, hostname: domains.hostname }).from(domains).where(inArray(domains.id, domainIds))
    const hostnames = new Map(domainRows.map(domain => [domain.id, domain.hostname]))
    for (const link of result)
      link.domain = hostnames.get(link.domainId)
  }
  return await addTagsToLinksFromDatabase(db, workspaceId, result)
}

export function buildD1LinkValues(event: H3Event, link: Link, effectiveExpiresAt?: number | null) {
  return {
    id: link.id,
    workspaceId: link.workspaceId,
    domainId: link.domainId,
    createdBy: link.createdBy ?? null,
    slug: link.slug,
    url: link.url,
    comment: link.comment ?? null,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    expiration: link.expiration ?? null,
    title: link.title ?? null,
    description: link.description ?? null,
    image: link.image ?? null,
    apple: link.apple ?? null,
    google: link.google ?? null,
    cloaking: link.cloaking ?? null,
    redirectWithQuery: link.redirectWithQuery ?? null,
    password: link.password ?? null,
    unsafe: link.unsafe ?? null,
    geo: link.geo ?? null,
    normalizedUrl: withoutQuery(link.url),
    effectiveExpiresAt: effectiveExpiresAt === undefined ? getExpiration(event, link.expiration) ?? null : effectiveExpiresAt,
  }
}

export async function d1GetActiveLinkBySlug(event: H3Event, scope: Required<LinkScope>, slug: string): Promise<{ link: Link, effectiveExpiresAt: number | null } | null> {
  const rows = await getDatabase(event).select().from(links).where(and(scopeCondition(scope), eq(links.slug, slug), activeCondition())).limit(1)
  const row = rows[0]
  if (!row)
    return null
  const [link] = await rowsToLinks(event, scope.workspaceId, [row])
  return link ? { link, effectiveExpiresAt: row.effectiveExpiresAt } : null
}

export async function d1GetActiveLink(event: H3Event, scope: LinkScope, id: string): Promise<{ link: Link, effectiveExpiresAt: number | null } | null> {
  const rows = await getDatabase(event).select().from(links).where(and(scopeCondition(scope), eq(links.id, id), activeCondition())).limit(1)
  const row = rows[0]
  if (!row)
    return null
  const [link] = await rowsToLinks(event, scope.workspaceId, [row])
  return link ? { link, effectiveExpiresAt: row.effectiveExpiresAt } : null
}

export async function d1GetAnyLink(event: H3Event, scope: LinkScope, id: string): Promise<Link | null> {
  const rows = await getDatabase(event).select().from(links).where(and(scopeCondition(scope), eq(links.id, id))).limit(1)
  return rows[0] ? (await rowsToLinks(event, scope.workspaceId, rows))[0] ?? null : null
}

export async function d1GetLinkWithMetadata(event: H3Event, scope: LinkScope, id: string): Promise<{ link: Link | null, metadata: Record<string, unknown> | null }> {
  const rows = await getDatabase(event).select().from(links).where(and(scopeCondition(scope), eq(links.id, id))).limit(1)
  const row = rows[0]
  const link = row ? (await rowsToLinks(event, scope.workspaceId, [row]))[0] ?? null : null
  return { link, metadata: row && link ? { expiration: row.effectiveExpiresAt ?? undefined, url: withoutQuery(link.url), comment: link.comment } : null }
}

export async function d1HasActiveLinkVersion(event: H3Event, scope: LinkScope, link: Link): Promise<boolean> {
  const rows = await getDatabase(event).select({ id: links.id }).from(links).where(and(
    scopeCondition(scope),
    eq(links.id, link.id),
    eq(links.updatedAt, link.updatedAt),
    activeCondition(),
  )).limit(1)
  return rows.length > 0
}

export async function d1GetActiveLinkVersions(event: H3Event, scope: LinkScope, expectedLinks: Link[]): Promise<Set<string>> {
  if (!expectedLinks.length)
    return new Set()
  const rows = await getDatabase(event).select({ id: links.id }).from(links).where(and(
    scopeCondition(scope),
    activeCondition(),
    or(...expectedLinks.map(link => and(eq(links.id, link.id), eq(links.updatedAt, link.updatedAt)))),
  ))
  return new Set(rows.map(row => row.id))
}

async function assertWritableDomain(event: H3Event, scope: LinkScope, domainId: string): Promise<void> {
  const [domain] = await getDatabase(event).select({ id: domains.id }).from(domains).where(and(
    eq(domains.id, domainId),
    eq(domains.workspaceId, scope.workspaceId),
    eq(domains.status, 'active'),
  )).limit(1)
  if (!domain)
    throw createError({ status: 400, statusText: 'Domain is not active in this workspace' })
}

function buildCreateLinkStatements(event: H3Event, db: ReturnType<typeof getDatabase>, link: Link) {
  const values = buildD1LinkValues(event, link)
  const effectiveExpiresAt = values.effectiveExpiresAt
  const pendingValues = { ...values, effectiveExpiresAt: 0 }
  const pendingLink = and(eq(links.id, link.id), eq(links.effectiveExpiresAt, 0))
  const insert = db.insert(links).select(db.select({
    domainId: sql<string>`${pendingValues.domainId}`.as('domainId'),
    workspaceId: sql<string>`${pendingValues.workspaceId}`.as('workspaceId'),
    slug: sql<string>`${pendingValues.slug}`.as('slug'),
    id: sql<string>`${pendingValues.id}`.as('id'),
    createdBy: sql<string | null>`${pendingValues.createdBy}`.as('createdBy'),
    url: sql<string>`${pendingValues.url}`.as('url'),
    comment: sql<string | null>`${pendingValues.comment}`.as('comment'),
    createdAt: sql<number>`${pendingValues.createdAt}`.as('createdAt'),
    updatedAt: sql<number>`${pendingValues.updatedAt}`.as('updatedAt'),
    expiration: sql<number | null>`${pendingValues.expiration}`.as('expiration'),
    title: sql<string | null>`${pendingValues.title}`.as('title'),
    description: sql<string | null>`${pendingValues.description}`.as('description'),
    image: sql<string | null>`${pendingValues.image}`.as('image'),
    apple: sql<string | null>`${pendingValues.apple}`.as('apple'),
    google: sql<string | null>`${pendingValues.google}`.as('google'),
    cloaking: sql<boolean | null>`${pendingValues.cloaking}`.as('cloaking'),
    redirectWithQuery: sql<boolean | null>`${pendingValues.redirectWithQuery}`.as('redirectWithQuery'),
    password: sql<string | null>`${pendingValues.password}`.as('password'),
    unsafe: sql<boolean | null>`${pendingValues.unsafe}`.as('unsafe'),
    geo: sql<Link['geo'] | null>`${pendingValues.geo === null ? null : JSON.stringify(pendingValues.geo)}`.as('geo'),
    normalizedUrl: sql<string>`${pendingValues.normalizedUrl}`.as('normalizedUrl'),
    effectiveExpiresAt: sql<number>`${pendingValues.effectiveExpiresAt}`.as('effectiveExpiresAt'),
  }).from(organizations).where(and(
    eq(organizations.id, link.workspaceId),
    workspaceWritableCondition(db, link.workspaceId),
  ))).onConflictDoNothing().returning({ id: links.id })
  const clearTombstone = db.delete(linkTombstones).where(and(
    eq(linkTombstones.domainId, link.domainId),
    eq(linkTombstones.slug, link.slug),
    exists(db.select({ id: links.id }).from(links).where(pendingLink)),
  ))
  const tagInserts = link.tags.map(tag => db.insert(tags).select(
    db.select({ workspaceId: links.workspaceId, name: sql<string>`${tag}`.as('name') }).from(links).where(pendingLink),
  ).onConflictDoNothing())
  const associationInserts = link.tags.map(tag => db.insert(linkTags).select(
    db.select({ workspaceId: links.workspaceId, linkId: links.id, tagName: sql<string>`${tag}`.as('tag_name') }).from(links).where(pendingLink),
  ).onConflictDoNothing())
  const finalize = db.update(links).set({ effectiveExpiresAt }).where(pendingLink)
  return { statements: [insert, clearTombstone, ...tagInserts, ...associationInserts, finalize] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]], effectiveExpiresAt }
}

export async function d1CreateLink(event: H3Event, scope: LinkScope, link: Link): Promise<{ created: boolean, effectiveExpiresAt: number | null }> {
  await assertWritableDomain(event, scope, link.domainId)
  if (link.workspaceId !== scope.workspaceId)
    throw createError({ status: 403, statusText: 'Link workspace does not match request scope' })
  const db = getDatabase(event)
  const batch = buildCreateLinkStatements(event, db, link)
  const [created] = await db.batch(batch.statements)
  return { created: (created as { id: string }[]).length > 0, effectiveExpiresAt: batch.effectiveExpiresAt }
}

export async function d1CreateLinks(event: H3Event, scope: LinkScope, importedLinks: Link[]): Promise<{ created: boolean, effectiveExpiresAt: number | null }[]> {
  if (!importedLinks.length)
    return []
  for (const domainId of new Set(importedLinks.map(link => link.domainId)))
    await assertWritableDomain(event, scope, domainId)
  if (importedLinks.some(link => link.workspaceId !== scope.workspaceId))
    throw createError({ status: 403, statusText: 'Link workspace does not match request scope' })
  const db = getDatabase(event)
  const batches = importedLinks.map(link => buildCreateLinkStatements(event, db, link))
  const insertIndexes: number[] = []
  let statementCount = 0
  const statements = batches.flatMap((batch) => {
    insertIndexes.push(statementCount)
    statementCount += batch.statements.length
    return batch.statements
  })
  const results = await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return batches.map((batch, index) => ({ created: (results[insertIndexes[index]!] as { id: string }[]).length > 0, effectiveExpiresAt: batch.effectiveExpiresAt }))
}

export async function d1UpdateLink(event: H3Event, scope: LinkScope, link: Link, expected?: ExpectedLinkVersion): Promise<{ updated: boolean, previous: Link | null, effectiveExpiresAt: number | null }> {
  await assertWritableDomain(event, scope, link.domainId)
  const previous = await d1GetAnyLink(event, scope, link.id)
  if (!previous)
    return { updated: false, previous: null, effectiveExpiresAt: null }
  const values = buildD1LinkValues(event, link)
  const db = getDatabase(event)
  const currentVersion = and(scopeCondition(scope), eq(links.id, link.id), expected ? eq(links.updatedAt, expected.updatedAt) : undefined, workspaceWritableCondition(db, scope.workspaceId))
  const matchingLink = db.select({ id: links.id }).from(links).where(currentVersion)
  const clearTags = db.delete(linkTags).where(and(
    eq(linkTags.workspaceId, scope.workspaceId),
    eq(linkTags.linkId, link.id),
    exists(matchingLink),
  ))
  const tagInserts = link.tags.map(tag => db.insert(tags).select(
    db.select({ workspaceId: links.workspaceId, name: sql<string>`${tag}`.as('name') }).from(links).where(currentVersion),
  ).onConflictDoNothing())
  const associationInserts = link.tags.map(tag => db.insert(linkTags).select(
    db.select({ workspaceId: links.workspaceId, linkId: links.id, tagName: sql<string>`${tag}`.as('tag_name') }).from(links).where(currentVersion),
  ).onConflictDoNothing())
  const update = db.update(links).set(values).where(currentVersion).returning({ id: links.id })
  const results = await db.batch([clearTags, ...tagInserts, ...associationInserts, update])
  return { updated: ((results.at(-1) as { id: string }[]) ?? []).length > 0, previous, effectiveExpiresAt: values.effectiveExpiresAt }
}

export async function d1DeleteLink(event: H3Event, scope: LinkScope, id: string): Promise<Link | null> {
  const previous = await d1GetAnyLink(event, scope, id)
  if (!previous)
    return null
  const db = getDatabase(event)
  const now = Math.floor(Date.now() / 1000)
  const writable = workspaceWritableCondition(db, scope.workspaceId)
  await db.batch([
    db.delete(links).where(and(scopeCondition(scope), eq(links.id, id), writable)),
    db.insert(linkTombstones).select(db.select({ domainId: sql<string>`${previous.domainId}`.as('domain_id'), slug: sql<string>`${previous.slug}`.as('slug'), deletedAt: sql<number>`${now}`.as('deleted_at') }).from(organizations).where(and(eq(organizations.id, scope.workspaceId), writable))).onConflictDoUpdate({
      target: [linkTombstones.domainId, linkTombstones.slug],
      set: { deletedAt: now },
    }),
  ])
  return previous
}

function encodeCursor(cursor: D1Cursor): string {
  return `${D1_CURSOR_PREFIX}${btoa(JSON.stringify(cursor))}`
}

function decodeCursor(value: string | undefined, sort: LinkSortBy, options: ListLinksOptions): D1Cursor | undefined {
  if (!value)
    return undefined
  if (!value.startsWith(D1_CURSOR_PREFIX))
    throw createError({ status: 400, statusText: 'Invalid pagination cursor' })
  try {
    const cursor = JSON.parse(atob(value.slice(D1_CURSOR_PREFIX.length))) as D1Cursor
    if (cursor.sort !== sort || cursor.tag !== options.tag || cursor.status !== (options.status ?? 'active') || cursor.domainId !== options.domainId || typeof cursor.id !== 'string' || typeof cursor.slug !== 'string')
      throw new Error('Cursor does not match query')
    if ((sort === 'newest' || sort === 'oldest') && typeof cursor.createdAt !== 'number')
      throw new Error('Cursor is missing creation time')
    return cursor
  }
  catch {
    throw createError({ status: 400, statusText: 'Invalid pagination cursor' })
  }
}

function afterTextCursor(column: typeof links.slug, value: string, id: string, direction: 'asc' | 'desc') {
  return direction === 'asc'
    ? or(gt(column, value), and(eq(column, value), gt(links.id, id)))
    : or(lt(column, value), and(eq(column, value), gt(links.id, id)))
}

export async function d1ListLinks(event: H3Event, scope: LinkScope, options: ListLinksOptions): Promise<ListLinksResult> {
  const db = getDatabase(event)
  const sort = options.sort ?? 'newest'
  const status = options.status ?? 'active'
  const cursor = decodeCursor(options.cursor, sort, options)
  let cursorCondition
  let order
  if (sort === 'az') {
    cursorCondition = cursor ? afterTextCursor(links.slug, cursor.slug, cursor.id, 'asc') : undefined
    order = [asc(links.slug), asc(links.id)]
  }
  else if (sort === 'za') {
    cursorCondition = cursor ? afterTextCursor(links.slug, cursor.slug, cursor.id, 'desc') : undefined
    order = [desc(links.slug), asc(links.id)]
  }
  else if (sort === 'newest') {
    cursorCondition = cursor ? or(lt(links.createdAt, cursor.createdAt!), and(eq(links.createdAt, cursor.createdAt!), gt(links.id, cursor.id))) : undefined
    order = [desc(links.createdAt), asc(links.id)]
  }
  else {
    cursorCondition = cursor ? or(gt(links.createdAt, cursor.createdAt!), and(eq(links.createdAt, cursor.createdAt!), gt(links.id, cursor.id))) : undefined
    order = [asc(links.createdAt), asc(links.id)]
  }
  const rows = await db.select().from(links).where(and(
    scopeCondition({ ...scope, domainId: options.domainId ?? scope.domainId }),
    statusCondition(status),
    exactTagCondition(db, scope.workspaceId, options.tag),
    cursorCondition,
  )).orderBy(...order).limit(options.limit + 1)
  const hasMore = rows.length > options.limit
  const page = hasMore ? rows.slice(0, options.limit) : rows
  const last = page.at(-1)
  return {
    links: await rowsToLinks(event, scope.workspaceId, page),
    list_complete: !hasMore,
    cursor: hasMore && last ? encodeCursor({ sort, id: last.id, slug: last.slug, createdAt: last.createdAt, tag: options.tag, status, domainId: options.domainId }) : undefined,
  }
}

export async function* d1IterateAllLinks(env: Cloudflare.Env, scope: LinkScope): AsyncIterable<Link> {
  const db = drizzle(env.DB)
  let lastId: string | undefined
  do {
    const rows = await db.select().from(links).where(and(scopeCondition(scope), lastId ? gt(links.id, lastId) : undefined)).orderBy(asc(links.id)).limit(100)
    if (!rows.length)
      break
    const pageLinks = rows.map(rowToLink)
    await addTagsToLinksFromDatabase(db, scope.workspaceId, pageLinks)
    for (const link of pageLinks)
      yield link
    lastId = rows.at(-1)?.id
    if (rows.length < 100)
      break
  } while (lastId)
}

function linkFilterCondition(db: ReturnType<typeof getDatabase>, scope: LinkScope, options: LinkFilterOptions) {
  const conditions = [scopeCondition({ ...scope, domainId: options.domainId ?? scope.domainId }), statusCondition(options.status ?? 'active')]
  if (options.tag)
    conditions.push(exactTagCondition(db, scope.workspaceId, options.tag))
  if (options.url)
    conditions.push(eq(links.normalizedUrl, withoutQuery(options.url)))
  if (options.q) {
    const pattern = `%${options.q.toLowerCase().replace(/[!%_]/g, '!$&')}%`
    conditions.push(or(
      sql`lower(${links.slug}) like ${pattern} escape '!'`,
      sql`lower(${links.url}) like ${pattern} escape '!'`,
      sql`lower(coalesce(${links.comment}, '')) like ${pattern} escape '!'`,
      sql`exists (select 1 from ${linkTags} where ${linkTags.workspaceId} = ${scope.workspaceId} and ${linkTags.linkId} = ${links.id} and lower(${linkTags.tagName}) like ${pattern} escape '!')`,
    )!)
  }
  return and(...conditions)
}

export async function d1SearchLinks(event: H3Event, scope: LinkScope, options: SearchLinksOptions): Promise<LinkSearchItem[]> {
  const db = getDatabase(event)
  let query = db.select({ id: links.id, domainId: links.domainId, domain: domains.hostname, slug: links.slug, url: links.normalizedUrl, comment: links.comment })
    .from(links)
    .innerJoin(domains, eq(domains.id, links.domainId))
    .where(linkFilterCondition(db, scope, options))
    .orderBy(asc(links.slug), asc(links.id))
    .$dynamic()
  if (options.limit)
    query = query.limit(options.limit)
  const rows = await query
  const result = rows.map(row => ({
    id: row.id,
    domainId: row.domainId,
    domain: row.domain,
    slug: row.slug,
    url: row.url,
    tags: [] as string[],
    ...(row.comment === null ? {} : { comment: row.comment }),
  }))
  return await addTagsToLinksFromDatabase(db, scope.workspaceId, result) as LinkSearchItem[]
}

export async function d1CountLinks(event: H3Event, scope: LinkScope, options: LinkFilterOptions): Promise<number> {
  const [result] = await getDatabase(event).select({ count: count() }).from(links).where(linkFilterCondition(getDatabase(event), scope, options))
  return result?.count ?? 0
}

export async function d1ListTags(event: H3Event, scope: LinkScope): Promise<{ name: string, count: number }[]> {
  return await getDatabase(event).select({ name: tags.name, count: count(linkTags.linkId) }).from(tags).innerJoin(linkTags, and(eq(linkTags.workspaceId, tags.workspaceId), eq(linkTags.tagName, tags.name))).where(eq(tags.workspaceId, scope.workspaceId)).groupBy(tags.workspaceId, tags.name).orderBy(asc(tags.name))
}
