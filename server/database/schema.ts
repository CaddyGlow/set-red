import type { Link } from '../../shared/schemas/link'
import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const timestamp = (name: string) => integer(name, { mode: 'timestamp' })

// Better Auth core tables.
export const users = sqliteTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  isInstanceAdmin: integer('is_instance_admin', { mode: 'boolean' }).notNull().default(false),
})

// A singleton claim used to make the one-time bootstrap race-safe.
export const instanceBootstrap = sqliteTable('instance_bootstrap', {
  id: integer().primaryKey(),
  claim: text().notNull().unique(),
  completedAt: timestamp('completed_at').notNull(),
})

// Better Auth organization is the persisted workspace.
export const organizations = sqliteTable('organization', {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  metadata: text(),
  createdAt: timestamp('created_at').notNull(),
})

export const sessions = sqliteTable('session', {
  id: text().primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id').references(() => organizations.id, { onDelete: 'set null' }),
}, table => [
  index('session_user_id_idx').on(table.userId),
])

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  activeWorkspaceId: text('active_workspace_id').references(() => organizations.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').notNull(),
})

export const accounts = sqliteTable('account', {
  id: text().primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text(),
  password: text(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, table => [
  index('account_user_id_idx').on(table.userId),
  uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
])

export const verifications = sqliteTable('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, table => [
  index('verification_identifier_idx').on(table.identifier),
])

export const members = sqliteTable('member', {
  id: text().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text({ enum: ['owner', 'admin', 'member', 'viewer'] }).notNull(),
  createdAt: timestamp('created_at').notNull(),
}, table => [
  uniqueIndex('member_organization_user_idx').on(table.organizationId, table.userId),
  index('member_user_id_idx').on(table.userId),
])

export const invitations = sqliteTable('invitation', {
  id: text().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: text().notNull(),
  role: text({ enum: ['owner', 'admin', 'member', 'viewer'] }).notNull(),
  status: text({ enum: ['pending', 'accepted', 'rejected', 'canceled'] }).notNull().default('pending'),
  inviterId: text('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
  deliveryStatus: text('delivery_status', { enum: ['pending', 'sent', 'failed'] }).notNull().default('pending'),
  deliveryAttempts: integer('delivery_attempts').notNull().default(0),
  lastDeliveryAttemptAt: timestamp('last_delivery_attempt_at'),
}, table => [
  index('invitation_organization_id_idx').on(table.organizationId),
  index('invitation_email_idx').on(table.email),
  uniqueIndex('invitation_pending_organization_email_idx')
    .on(table.organizationId, table.email)
    .where(sql`${table.status} = 'pending'`),
])

// Better Auth API-key plugin table. `referenceId` is an organization ID.
export const apiKeys = sqliteTable('apikey', {
  id: text().primaryKey(),
  configId: text('config_id').notNull().default('workspace'),
  name: text(),
  start: text(),
  referenceId: text('reference_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  prefix: text(),
  key: text().notNull(),
  refillInterval: integer('refill_interval'),
  refillAmount: integer('refill_amount'),
  lastRefillAt: timestamp('last_refill_at'),
  enabled: integer({ mode: 'boolean' }).default(true),
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }).default(true),
  rateLimitTimeWindow: integer('rate_limit_time_window').default(86_400_000),
  rateLimitMax: integer('rate_limit_max').default(10),
  requestCount: integer('request_count').default(0),
  remaining: integer(),
  lastRequest: timestamp('last_request'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  permissions: text(),
  metadata: text(),
}, table => [
  index('apikey_config_id_idx').on(table.configId),
  index('apikey_reference_id_idx').on(table.referenceId),
  uniqueIndex('apikey_key_idx').on(table.key),
])

export const domains = sqliteTable('domains', {
  id: text().primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  hostname: text().notNull().unique(),
  status: text({ enum: ['active', 'disabled'] }).notNull().default('active'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  notFoundRedirect: text('not_found_redirect'),
  homeUrl: text('home_url'),
  createdAt: integer('created_at').notNull(),
}, table => [
  index('domains_workspace_id_idx').on(table.workspaceId),
  uniqueIndex('domains_one_primary_per_workspace_idx')
    .on(table.workspaceId)
    .where(sql`${table.isPrimary} = 1`),
])

export const workspaceSettings = sqliteTable('workspace_settings', {
  workspaceId: text('workspace_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  webhookUrl: text('webhook_url'),
  webhookSecret: text('webhook_secret'),
  defaultSlugLength: integer('default_slug_length').notNull().default(6),
  caseSensitive: integer('case_sensitive', { mode: 'boolean' }).notNull().default(false),
  redirectStatusCode: integer('redirect_status_code').notNull().default(301),
})

export const auditLogs = sqliteTable('audit_logs', {
  id: text().primaryKey(),
  workspaceId: text('workspace_id').references(() => organizations.id, { onDelete: 'set null' }),
  workspaceRef: text('workspace_ref'),
  actorType: text('actor_type', { enum: ['user', 'api-key', 'access-service', 'system'] }).notNull(),
  actorId: text('actor_id').notNull(),
  action: text().notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  metadata: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at').notNull(),
}, table => [
  index('audit_logs_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('audit_logs_workspace_ref_created_at_id_idx').on(table.workspaceRef, table.createdAt, table.id),
  index('audit_logs_created_at_id_idx').on(table.createdAt, table.id),
  index('audit_logs_actor_idx').on(table.actorType, table.actorId),
])

export const workspaceDeletionJobs = sqliteTable('workspace_deletion_jobs', {
  workspaceId: text('workspace_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  requestedByType: text('requested_by_type', { enum: ['user', 'access-service'] }).notNull(),
  requestedById: text('requested_by_id').notNull(),
  workspaceSlug: text('workspace_slug').notNull(),
  state: text({ enum: ['pending', 'purging'] }).notNull().default('pending'),
  storageDrainUntil: timestamp('storage_drain_until').notNull(),
  lastErrorCode: text('last_error_code'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, table => [
  index('workspace_deletion_jobs_state_drain_idx').on(table.state, table.storageDrainUntil),
])

export const links = sqliteTable('links', {
  domainId: text('domain_id').notNull().references(() => domains.id, { onDelete: 'restrict' }),
  workspaceId: text('workspace_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  slug: text().notNull(),
  id: text().notNull().unique(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  url: text().notNull(),
  comment: text(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiration: integer(),
  title: text(),
  description: text(),
  image: text(),
  apple: text(),
  google: text(),
  cloaking: integer({ mode: 'boolean' }),
  redirectWithQuery: integer('redirect_with_query', { mode: 'boolean' }),
  password: text(),
  unsafe: integer({ mode: 'boolean' }),
  geo: text({ mode: 'json' }).$type<Link['geo']>(),
  normalizedUrl: text('normalized_url').notNull(),
  effectiveExpiresAt: integer('effective_expires_at'),
}, table => [
  primaryKey({ columns: [table.domainId, table.slug] }),
  index('links_workspace_created_at_id_idx').on(table.workspaceId, table.createdAt, table.id),
  index('links_workspace_created_at_desc_id_idx').on(table.workspaceId, sql`${table.createdAt} desc`, table.id),
  index('links_workspace_normalized_url_idx').on(table.workspaceId, table.normalizedUrl),
  index('links_workspace_id_idx').on(table.workspaceId, table.id),
  index('links_domain_id_idx').on(table.domainId),
])

export const tags = sqliteTable('tags', {
  workspaceId: text('workspace_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text().notNull(),
}, table => [
  primaryKey({ columns: [table.workspaceId, table.name] }),
])

export const linkTags = sqliteTable('link_tags', {
  workspaceId: text('workspace_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  linkId: text('link_id').notNull().references(() => links.id, { onDelete: 'cascade' }),
  tagName: text('tag_name').notNull(),
}, table => [
  primaryKey({ columns: [table.workspaceId, table.linkId, table.tagName] }),
  foreignKey({
    columns: [table.workspaceId, table.tagName],
    foreignColumns: [tags.workspaceId, tags.name],
  }).onDelete('cascade'),
  index('link_tags_workspace_tag_link_idx').on(table.workspaceId, table.tagName, table.linkId),
])

export const linkTombstones = sqliteTable('link_tombstones', {
  domainId: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  slug: text().notNull(),
  deletedAt: integer('deleted_at').notNull(),
}, table => [
  primaryKey({ columns: [table.domainId, table.slug] }),
])
