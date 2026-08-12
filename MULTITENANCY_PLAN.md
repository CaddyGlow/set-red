# Fork Plan: Multi-Domain, RBAC, and User Separation

Status: proposal. Target: a greenfield fork of Sink that behaves like a workspace-based link
platform (Dub / OpenLink style) instead of a single-tenant, single-token instance.

This fork does **not** support upgrading an existing Sink deployment. It starts with a fresh D1
database, KV namespace, Analytics Engine dataset, and R2 namespace/prefix. No deployed links,
analytics, users, or cache entries are migrated, and no legacy compatibility path is retained.

Assumption stated up front: "similar to openlink" is read as the standard workspace model —
users belong to one or more workspaces, each workspace owns its own domains, links, analytics,
and members, and members hold a role inside the workspace. A different reference model, such as
strict per-user tenancy, is a foundational redesign and must be decided before implementation.

---

## 1. What exists today (verified against the tree)

Facts that constrain the design:

- **Authentication is instance-wide, not per user.** `server/middleware/2.auth.ts` accepts one
  shared bearer token (`runtimeConfig.siteToken`) or a Cloudflare Access JWT, and in both cases
  writes `event.context.userID` / `userEmail`. Site token maps to the literal user `root`; an
  Access *service* token also maps to `root` (`server/utils/cloudflare-access.ts:93-110`). There
  is no user table, no session store, no per-user credential.
- **There is no authorization layer at all.** Any authenticated caller can hit every `/api/**`
  route. `server/api/verify.get.ts` only echoes the auth method back.
- **Links are keyed by bare slug.** `links.slug` is the primary key
  (`server/database/schema.ts:5-30`), `link_tags.link_slug` and `link_tombstones.slug` reference
  it, and the KV cache key is `link:${slug}` (`server/services/link-store/kv.ts`). A slug is
  therefore globally unique across the whole instance.
- **Multi-domain today is cosmetic.** `wrangler.jsonc:61-67` routes `set.red`, `brut.mov`, and
  `elan.ing` to the same Worker with an explicit comment: all three share one link pool, and
  `/abc` resolves identically on every domain. `server/middleware/1.redirect.ts:51-69` never
  looks at the request host when resolving a slug.
- **Analytics is keyed by link id only.** `writeAccessLog` sets `indexes: [link.id]` and 16 blobs
  (`server/utils/access-log.ts:21-38, 189-207`). Analytics Engine allows exactly one index, so
  tenant filtering has no cheap path today. Query filters are built in
  `server/utils/query-filter.ts` from user-supplied query params with no server-side scoping.
- **D1 is authoritative, KV is a write-through cache** plus the legacy pre-D1 source, gated by a
  completed migration marker (`server/middleware/3.link-store-gate.ts`,
  `server/services/link-store/migration.ts`). All link writes must keep flowing through
  `server/utils/link-store.ts`.
- **The frontend is a client-only SPA** (`ssr: false`), auth state lives in
  `app/composables/useAuthSession.ts`, the route guard is `app/middleware/auth.global.ts`, and
  login is a single token field (`app/components/login/Form.vue`).
- **Side systems that also leak across tenants:** R2 image uploads
  (`server/api/upload/image.post.ts`, `server/utils/r2.ts`), the daily backup cron
  (`server/plugins/backup.ts`), webhooks (`server/utils/webhook.ts`, one global URL/secret in
  runtime config), AI slug generation, and the safe-browsing checker.

## 2. Target model

```
User ──< Membership >── Workspace ──< Domain ──< Link
                            │
                            ├──< ApiKey
                            ├──< Invitation
                            └──< WorkspaceSettings (webhook, defaults, quotas)
```

- A **User** is a real account with credentials and sessions.
- A **Workspace** is the tenancy and billing/quota boundary. Every link, domain, tag, private
  storage object, and analytics row belongs to exactly one workspace. Public link assets remain
  readable without a dashboard session.
- A **Domain** belongs to a workspace. Slug uniqueness becomes `(domain_id, slug)`, not `slug`.
- **Membership** carries the role. Roles: `owner`, `admin`, `member`, `viewer`.
- **ApiKey** replaces the shared site token: hashed, workspace-scoped, permission-scoped,
  revocable, and implemented with better-auth's API-key plugin.
- The shared site token does not exist in the fork. Instance administration uses a real user
  explicitly marked as instance admin, an explicitly configured Access service identity, or the
  one-time bootstrap flow.

### Role/permission matrix

| Capability | owner | admin | member | viewer |
|---|---|---|---|---|
| read links, analytics, export | yes | yes | yes | yes |
| create/edit/delete own links | yes | yes | yes | no |
| edit/delete others' links | yes | yes | no | no |
| bulk import, backup/restore | yes | yes | no | no |
| assign/configure workspace domains | yes | yes | no | no |
| add/remove domains instance-wide | instance admin only | | | |
| invite/remove members, change roles | yes | yes (not owner) | no | no |
| create/revoke API keys | yes | yes | own keys only | no |
| workspace settings, webhooks | yes | yes | no | no |
| delete workspace, transfer ownership | yes | no | no | no |

Implement this from one pure declarative statement in `shared/auth/permissions.ts`, exporting
`can(role, permission)` and the `Role`/`Permission` types for server guards and UI affordances.
The server-only better-auth configuration derives its `createAccessControl()` roles and API-key
permission resources from the same statement. Do not scatter role strings or maintain a second
plugin-specific permission matrix.

## 3. Data model changes

Target tables in `server/database/schema.ts` (Drizzle; committed migrations follow the delivery
phases during development, while a fresh deployment applies the complete set):

Per §4 the tenancy tables are **better-auth's**, not hand-rolled. "Workspace" is the product
name for its `organization`. Do not build a parallel `workspaces`/`memberships`/`invitations`
set — that would mean two sources of truth for membership.

Owned by better-auth (declared in `server/database/schema.ts` so Drizzle generates migrations):

```
user             id, email (unique), emailVerified, name, image, ...
                 + isInstanceAdmin            // our extension
session          id, userId, expiresAt, ...
                 + activeOrganizationId       // plugin-provided; drives workspace resolution
account          id, userId, providerId, accountId, ...  // OAuth/OIDC/Access linkage
organization     id, slug (unique), name, logo, metadata, createdAt   // = workspace
member           id, userId, organizationId, role, createdAt
invitation       id, email, inviterId, organizationId, role, status, expiresAt
```

Ours:

```
domains          id, workspaceId, hostname (unique), status ('active'|'disabled'),
                 isPrimary, notFoundRedirect, homeUrl, createdAt
                 // operator-provisioned; see §6 — no verification columns
workspace_settings  workspaceId (PK), webhookUrl, webhookSecret,
                    defaultSlugLength, caseSensitive, redirectStatusCode, ...
audit_logs        id, workspaceId (nullable for instance events), actorType, actorId,
                  action, targetType, targetId, metadata, createdAt
```

API-key tables and fields are owned by better-auth's API-key plugin. Keys use
`organizationId = workspaceId`, store only a hash, and carry an explicit permission grant. Do
not add a parallel application-owned key table.

Database invariants:

- `domains.hostname` stores the exact canonical ASCII hostname (lowercase IDNA/punycode, with no
  port). `www.example.com` and `example.com` are distinct unless both are configured; never strip
  `www.` during lookup.
- A partial unique index on `domains(workspace_id) WHERE is_primary = 1` permits at most one
  primary domain per workspace. Application validation requires one primary domain before links
  can be created.
- A domain with links is not reassignable. Moving it requires deleting or explicitly moving all
  links first, disabling the domain, and waiting for the bounded host-cache TTL to elapse.
- Because `links.workspace_id` is denormalized, all link writes validate that the selected
  domain belongs to the same workspace. Domain mutation and link mutation live in one service;
  handlers cannot write either table directly.

Note the plugin ships three default roles (owner/admin/member, where member is read-only). The
§2 matrix has four, with a writing `member` and a read-only `viewer`. Express that through
`createAccessControl()` static roles rather than accepting the defaults.

Changes to existing tables:

- `links`: add `domainId` (FK, not null), `workspaceId` (denormalized, not null, for cheap
  filtering), `createdBy` (userId, nullable). Primary key becomes `(domain_id, slug)`. All four
  existing indexes get `domain_id` (or `workspace_id`) as the leading column. Keep `links.id`
  globally unique with a unique constraint — it is the analytics correlation key and the
  application-level surrogate used by tags and other relationships.
- `link_tags`: `link_slug` alone no longer identifies a link. Reuse the existing globally unique
  `links.id` and define `link_tags` as `(workspace_id, link_id, tag_name)`, with a FK from
  `link_id` to `links.id` and a composite FK from `(workspace_id, tag_name)` to
  `tags(workspace_id, name)`. The link service validates that the link and tag workspace match.
- `tags`: currently a global table keyed by name. Becomes `(workspace_id, name)` composite PK so
  two workspaces can use the same tag name independently.
- `link_tombstones`: becomes `(domain_id, slug)`.
- `link_migration_runs`: removed from the fork.

This is a greenfield schema. Replace the pre-fork link tables in the initial fork migration;
there is no nullable expansion, backfill, compatibility table, or resumable data migration.

## 4. Authentication

**Decided: better-auth with its first-party D1 support, plus the `organization` and API-key
plugins.** Not a hand-rolled session or API-key stack. Pin the tested better-auth core and plugin
versions together in `package.json`; instantiate auth request-locally with the current D1 binding.

What the spike established:

- Better-auth supports D1 directly. Its required core, organization, and API-key schema is still
  declared in `server/database/schema.ts`, and the committed Drizzle migrations remain the only
  schema deployment mechanism because `tests/setup.ts` applies `drizzle/` automatically.
- Nitro mounts the handler at `/api/auth/[...all]`. `2.auth.ts` must explicitly bypass
  `/api/auth/**`; better-auth authenticates and applies CSRF/origin checks to its own endpoints.
  Better-auth hooks enforce the product permission matrix on organization and API-key mutation
  endpoints inside that catch-all, so those endpoints cannot bypass the application wrapper.
  Add an auth-boundary test for each protected plugin mutation. The application middleware
  authenticates all other `/api/**` routes by calling better-auth's server API for a session or
  validating an API key.
- The `organization` plugin's data model is close enough to the workspace model that it should
  **replace** the hand-rolled tables rather than sit beside them (see §3).

Two measurements remain in Phase 0:

1. **Password hashing cost.** Better-auth uses scrypt by default. Measure registration and login
   against the paid plan's CPU budget. If it is unsuitable, use a reviewed Web Crypto password
   hashing implementation with recorded parameters and test vectors; do not casually weaken the
   cost merely to meet a benchmark.
2. **Worker bundle size** with the auth stack plus the existing UA-parser and analytics
   dependencies.

Do not put sessions in the link KV namespace. Secondary session storage is optional and gets a
dedicated KV binding only if measurements justify it.

Auth methods to support in the fork, all resolving to the same `event.context.auth` shape:

1. **Session cookie** — browser dashboard. Requires CSRF protection; the existing
   `isCloudflareAccessRequestSafe` origin/`Sec-Fetch-Site` check
   (`server/utils/cloudflare-access.ts:150-161`) is the right pattern to generalize to all
   cookie-authenticated mutations. Configure better-auth's base URL, trusted origins, secure
   cookie settings, and secret explicitly for the app hostname; short-link domains never host
   authenticated dashboard sessions.
2. **API key** — `Authorization: Bearer <key>` through better-auth's API-key plugin. Every key is
   organization-owned and contains an explicit permission grant capped by the creator's current
   permissions. A key authenticates only its bound workspace; `x-workspace-id` is rejected when
   it conflicts. At authentication time, a user-owned key's effective grant is intersected with
   the creator's current membership permissions, and member removal revokes those keys.
   Deliberately independent service keys are owner/admin-created, visibly labelled, and audited
   separately.
3. **Cloudflare Access** — keep it, but change its meaning: a verified Access user JWT is an
   identity provider keyed by Access issuer plus subject, not by email alone. JIT-provision only
   when no account owns the verified email. If an account already exists without that Access
   identity, reject sign-in and require an authenticated account-link or instance-admin merge;
   never silently merge solely on matching email. Access *service* tokens map to an
   instance-admin principal only when explicitly configured.

Memberships have exactly one static role. Although better-auth can encode multiple roles, this
product rejects comma-separated or multi-role assignments so `event.context.auth.role` remains a
single `Role`. API keys use permissions rather than pretending to be a member role.

### Account enrollment and email

- Public password registration is off by default. The first owner is created by a one-time,
  expiring bootstrap command/token; later users join through workspace invitations or an
  explicitly enabled public-signup setting.
- Email/password mode requires `RESEND_API_KEY` and `AUTH_EMAIL_FROM` and implements invitation,
  email-verification, and password-reset delivery through Resend's HTTP API. Startup/config
  validation refuses to enable those flows without mail configuration. Deployments using only
  Cloudflare Access may disable email/password and mail entirely.
- Verification and reset tokens are single-use, expire, and never appear in application logs.
  Password reset revokes other sessions. Invitation acceptance verifies that the signed-in
  account owns the invited email.

Resulting context shape (replaces the loose `userID`/`userEmail`/`authMethod` triple):

```ts
event.context.auth = {
  method: 'session' | 'api-key' | 'access-user' | 'access-service',
  user: { id, email, name } | null,
  workspaceId: string | null,     // resolved per request, see §5
  role: Role | null,
  permissions: Permission[],      // member role expansion or API-key grant
  apiKeyId: string | null,
  isInstanceAdmin: boolean,
}
```

## 5. Authorization enforcement

The single most important rule for this fork: **tenant scoping must live in the data layer, not
in handlers.** Sink currently has 22 API routes; guarding each by hand guarantees a leak.

Design:

1. **Workspace resolution middleware** (`server/middleware/2.auth.ts` split into
   `2.auth.ts` + `3.workspace.ts`): `/api/auth/**` bypasses both application guards, but protected
   organization and API-key plugin mutations are guarded inside better-auth as described in §4.
   For an API key, its bound organization is authoritative and a conflicting `x-workspace-id` is
   rejected.
   For a user session, resolve an explicit `x-workspace-id` or
   `session.activeOrganizationId` (maintained by the plugin's `setActive()`), then verify current
   membership and load the single role. Never accept a workspace header without membership
   validation. Stash the resolved permissions in `event.context.auth`. Instance-admin bypasses
   require an audit record from Phase 2 onward; there is no unaudited interim bypass.
2. **Store-level scoping**: every function in `server/utils/link-store.ts` and
   `server/services/link-store/d1.ts` gains a mandatory `scope: { workspaceId, domainId? }`
   parameter, threaded into every `where` clause. Make it non-optional in the TypeScript
   signature so the compiler finds every call site. This is the mechanical bulk of the work.
3. **Route-level permission declaration**: add a small `requirePermission(event, 'links.write')`
   helper backed by the §2 matrix, called at the top of each mutating handler. It reads the
   effective permission set so the same guard works for sessions and API keys. Object-level
   checks additionally enforce `createdBy` for member-only own-link operations. Links created by
   service keys record `createdBy = null` plus their creator key ID in the audit log and are not
   considered owned by an ordinary member.
4. **Negative tests are the acceptance criterion**: for every route, a test asserting that
   workspace A cannot read, mutate, or enumerate workspace B's data (see §10).

## 6. Multi-domain

Two concerns: routing traffic to the Worker, and resolving `(host, slug)` to a link.

### Host resolution

- `server/middleware/1.redirect.ts` gains a host lookup before the slug lookup: canonicalize
  `getRequestHost(event)` to lowercase ASCII IDNA/punycode and strip only the port. Do not strip
  `www.` or otherwise alias hostnames implicitly. Look up the exact `domains` row and pass both
  `workspaceId` and `domainId` into `getLink`.
- Cache the host to domain mapping in KV under `domain:${hostname}` with a short TTL, plus an
  in-isolate `Map` with its own hard expiry for the hot path. Invalidate local state when a domain
  changes, but correctness does not depend on broadcast invalidation: domain disable/removal uses
  a two-stage operation that first disables new link writes, waits longer than both cache TTLs,
  then removes it. Domains containing links cannot be reassigned.
- The explicitly configured app host serves the marketing/dashboard app. An unknown host fails
  closed with 404. A known but disabled domain, or a missing slug on an active domain, may use
  that domain's `notFoundRedirect`, falling back to the instance default.
- `homeURL` and `notFoundRedirect` move from global runtime config to per-domain columns, with
  the global values as fallback.

### KV cache keys

`link:${slug}` becomes `link:${domainId}:${slug}`. The fork removes `readLegacyKvLink`, the
KV-to-D1 migration endpoints, `link_migration_runs`, and the link-store migration gate. A fresh
deployment starts with an empty KV namespace and D1 is authoritative from its first request.

### Getting traffic to the Worker

Domains are **operator-configured, not self-serve**. A domain exists because it is listed in
`wrangler.jsonc` `routes` as a `custom_domain` and deployed. There is no in-app domain
onboarding: no CNAME instructions, no TXT verification, no Cloudflare for SaaS custom hostnames,
no `pending`/`verifying` states.

Adding a domain is therefore a two-step operator action:

1. Add the `{ "pattern": "<hostname>", "custom_domain": true }` route to `wrangler.jsonc` and
   deploy, so Cloudflare routes the hostname to the Worker.
2. Create the `domains` row and assign it to a workspace — via a seed/CLI script or the audited
   instance-admin screen. Ownership is implied by control of the deploy; nothing is verified at
   runtime.

Consequence for the data model: `domains` needs no `verificationToken` or `verifiedAt`, and
`status` collapses to `active` / `disabled`. A hostname that reaches the Worker without a
matching `domains` row is treated as unknown (see the host-resolution rules above) — the config
and the table can drift, so the mismatch must fail closed rather than fall back to a default
workspace. Domain reassignment is prohibited while the domain owns links and follows the
disable-and-cache-drain operation described above even when it owns none.

## 7. Analytics tenancy

This is the subtlest part, because Analytics Engine allows only one index and the index is what
makes queries cheap.

Current: `indexes: [link.id]`, filtered via `index1` in `buildAnalyticsFilter`.

Proposed: use a new dataset named `sink_multitenant`, set `indexes: [workspaceId]`, move the link
id into `blob17`, and add `blob18 = domainId` and `blob19 = schemaVersion` (initial value `2`).
The tenant boundary is on the hot path of every query, so it is the index; per-link queries
filter `index1 = ws AND blob17 = linkId`, which prunes to a single tenant first. AE supports up
to 20 blobs, so 19 is within limits. Every query also injects `blob19 = '2'` so a later event
schema can cut over safely.

Non-negotiable: `buildAnalyticsFilter` must **inject** the workspace predicate server-side and
must ignore any client-supplied `index1`/workspace filter. Today the function builds filters
purely from user query params; that becomes a data-leak vector the moment tenancy exists.

There is no historical-data cutover: the fork provisions the new dataset before its first
request. Keep its binding and `NUXT_DATASET` value generated from the same deployment setting so
they cannot drift. Empty counters, charts, and realtime views still need explicit empty-state
tests for a newly created workspace.

Everything downstream (`server/api/stats/*`, `server/api/logs/*`, the realtime globe) inherits
the scoping automatically if it all routes through `buildAnalyticsFilter`. Audit that it does.

## 8. Greenfield provisioning

There is no upgrade or data-migration path. Provisioning creates empty resources and then seeds
only configuration:

1. Create a fresh D1 database and apply the complete multitenant schema, including better-auth,
   organization, API-key, domain, link, tag, settings, and audit tables. Do not apply the old Sink
   migrations first and do not include `link_migration_runs` or `tenancy_migration_runs`.
2. Create fresh KV, Analytics Engine (`sink_multitenant`), and R2 resources. Never point the fork
   at an older Sink deployment's bindings.
3. Run a one-time bootstrap command that creates the first user as instance admin, the default
   organization, its owner membership, and domain rows for the explicitly configured Worker
   routes. It consumes an expiring one-time bootstrap secret and refuses to run after an
   instance admin exists.
4. Validate before serving traffic that every configured short-link hostname has one active
   domain row, every workspace that may create links has exactly one primary domain, and the app
   hostname is explicitly distinguished from short-link hostnames.

Remove the old migration dashboard, API endpoints, middleware gate, schemas, tests, and legacy
KV parser from the fork. Future schema evolution uses ordinary committed Drizzle/D1 migrations,
but supporting imports from pre-fork Sink remains out of scope.

## 9. API and frontend surface

### Server routes

| Area | Change |
|---|---|
| `/api/link/*` (11 routes) | scope every read/write to the workspace; use globally unique `link.id` for authenticated query/edit/delete and cursors; add `domainId` to create/import payloads and domain filters; reserve `(domainId, slug)` lookup for redirects; `requirePermission` on mutations |
| `/api/stats/*`, `/api/logs/*` (6 routes) | inject workspace filter server-side |
| `/api/backup.post`, `server/plugins/backup.ts` | per-workspace backups; cron iterates workspaces; R2 keys prefixed `backups/${workspaceId}/` |
| `/api/upload/image.post` | R2 keys prefixed `uploads/${workspaceId}/` with an unguessable object ID; authenticated upload/delete verifies workspace ownership. Objects are never replaced at an immutable URL: edits create a new object and update the link. Public immutable reads under `/_assets/**` remain unauthenticated for redirects and social-preview bots and never provide listing |
| `/api/verify.get` | returns user, memberships, active workspace, role, permissions |
| new `/api/auth/**` | login, logout, register, verify email, reset password (better-auth catch-all) |
| new `/api/workspaces/**` | list, create, update, delete, members, invitations, role changes |
| new `/api/domains/**` | list the workspace's domains, set primary, edit `notFoundRedirect`/`homeUrl`. Creating and assigning domains is instance-admin only |
| better-auth API-key endpoints | list/create/revoke organization keys; secret shown once; better-auth hooks and the application wrapper enforce the product permission matrix and user-key cleanup; direct catch-all calls receive the same checks |

### Frontend

- New `app/pages/dashboard/settings/{workspace,members,domains,api-keys}.vue`, plus
  `app/pages/{login,register,invite/[token]}.vue`.
- Replace the token form and `app/utils/auth-token.ts` local-storage bearer flow with
  better-auth's cookie session client. Show registration only when public signup is enabled;
  invitation and bootstrap flows remain available independently.
- Workspace switcher in `app/components/dashboard/sidebar/NavUser.vue` (use `DropdownMenu` per
  the project convention; do not build a bespoke menu inside a `Popover`).
- Domain selector in the link editor (`app/components/dashboard/links/editor/Form.vue`) and in
  the link list filters; short-link previews (`buildShortLink` in `link-store.ts`) must use the
  link's domain, not the request host.
- Dashboard detail routes, search results, component keys, update/delete actions, and pagination
  use `link.id` as identity. Slug remains display data and is never sufficient to select a link
  inside a workspace that can own multiple domains.
- `app/composables/useAuthSession.ts` grows `workspaces`, `activeWorkspace`, `role`, and a
  `can(permission)` helper reading the shared matrix; `app/middleware/auth.global.ts` redirects
  to workspace selection when a user has no active workspace.
- Hide, do not merely disable, actions the role cannot perform; the server check remains
  authoritative.
- All new user-facing strings go into `i18n/locales/<locale>/*.json` under a new owning module
  (for example `workspace.json`, `auth.json`), registered in `i18n/i18n.ts`, and added to
  **every** locale directory in the same change.
- New forms live in dedicated `*Form.vue` components using `@tanstack/vue-form`; confirmations
  use `AlertDialog`; multi-step task content uses `ResponsiveModal`. Read `DESIGN.md` first and
  do not introduce new design tokens.

## 10. Testing

The existing suite (`tests/api/**`, `tests/redirect.spec.ts`, `tests/cloudflare-access.spec.ts`)
runs on `@cloudflare/vitest-pool-workers` with shared storage, `isolate: false`, `maxWorkers: 1`,
and applies `drizzle/` migrations in `tests/setup.ts`. Extend that, do not replace it.

- Add fixtures to `tests/utils.ts`: `createWorkspace`, `createUser`, `createMembership`,
  `createApiKey`, `withRole`. Keep unique-slug discipline; storage is shared across the run.
- **Cross-tenant isolation suite** (`tests/api/tenancy.spec.ts`): for every route, assert 403/404
  when workspace A touches workspace B's link, domain, upload, backup, and analytics.
- **RBAC matrix suite**: parameterized over roles × permissions, asserting the §2 table.
- **Host resolution suite**: same slug on two domains in two workspaces resolves to two
  different targets; also create the same slug on two domains in one workspace and verify list
  pagination, search, query, edit, delete, and backup handle both links; unknown host behaves
  correctly; case-sensitivity config still honored.
- **Provisioning suite**: start from empty bindings, run bootstrap once, assert the owner,
  workspace, primary domain, and resource configuration; assert replay and bootstrap after an
  owner exists both fail. No test seeds or accepts a pre-fork database/KV layout.
- **Auth-boundary suite**: unauthenticated better-auth login, callback, verification, reset, and
  invitation endpoints reach better-auth while every other `/api/**` endpoint remains protected;
  direct calls to organization and API-key mutation endpoints cannot bypass the product permission
  matrix; an API key cannot override its bound workspace with a header. The old site token is
  rejected and no browser credential is persisted in local storage.
- **Domain-cache suite**: cached host records expire in both KV and isolate memory; disable waits
  out the TTL before removal; a domain with links cannot be reassigned.
- **Public-asset suite**: another workspace cannot upload, replace, delete, or enumerate an
  object's key, while an anonymous social-preview request can read the immutable public URL.
- Remember: worker tests execute `.output/server/index.mjs`, so run `pnpm build` before the final
  test pass after server changes, or the run exercises stale output.

## 11. Delivery phases

Each phase is independently mergeable and leaves the app working.

| Phase | Content | Rough size |
|---|---|---|
| 0 | Fork and rename; define the greenfield schema/resources; scaffold pinned better-auth with native D1, organization, and API-key plugins; measure hash CPU and bundle size | medium |
| 1 | Auth tables/routes, explicit auth-route bypass, invite-only login/verification/reset UI, Resend integration, Access issuer+subject identity linkage, one-time owner bootstrap | large |
| 2 | Organizations/members/invitations, workspace resolution, permission matrix, audit log, members UI. No instance-admin bypass ships before audit exists | large |
| 3 | Greenfield tenant-owned link/domain/tag schema, scoped store layer, exact host-aware redirect, bounded caches, new KV keys, domain administration | very large |
| 4 | New `sink_multitenant` dataset, schema-versioned events, scoped stats/logs/realtime and empty states | medium |
| 5 | Better-auth organization API keys; per-workspace webhooks/backups; private R2 prefixes and unguessable public asset URLs | medium |
| 6 | Access parity and expanded instance-admin console; see `PLATFORM_ADMIN_PLAN.md` | planned |

Phase 3 is the risk concentration point. Do not start it until Phase 2's scoping middleware and
the isolation test harness exist. The fork is not production-deployable until Phase 5; earlier
phases are mergeable development milestones, not partially supported production modes.

## 12. Slug-collision audit

With `(domain_id, slug)` uniqueness, links on different domains, including domains in the same
workspace, can share a slug. Every
place below currently treats a bare slug as a unique key and breaks silently — no error, wrong
data. This list is the result of auditing the tree, and each entry is Phase 3 work.

| Site | Current behavior | Failure once slugs collide | Fix |
|---|---|---|---|
| `services/link-store/d1.ts:118` `addTagsToLinksFromDatabase` | builds `bySlug = new Map(...)` over a result page, then attaches tag rows by slug | two same-slug links in one page: **tags attach to the wrong link** | key the map by `links.id` |
| `services/link-store/d1.ts:204` `d1GetActiveLinkVersions` | returns `Set<slug>`; `writeThroughCaches` uses it to decide which KV entries to delete | stale cache entry kept, or the wrong domain's cache deleted | key by `${domainId}:${slug}` |
| `services/link-store/d1.ts:336-361` `d1ListLinks` | pagination cursor and tie-breaker contain only slug | a page boundary can skip one of two same-slug links | use globally unique `links.id` as the final cursor tie-breaker |
| `services/link-store/d1.ts:365-392` `d1IterateAllLinks` | backup iteration advances with `lastSlug` | a workspace backup can silently omit a same-slug link | scope by workspace and paginate by `links.id` |
| `services/link-store/d1.ts:415-422` `d1SearchLinks` | search results omit link id and domain | same-slug results are indistinguishable to the dashboard | return `links.id` and domain data |
| `services/link-store/kv.ts` | key `link:${slug}` | one domain's link **serves another domain's target** | `link:${domainId}:${slug}` (already §6) |
| `api/link/query.get.ts`, `api/link/edit.put.ts`, `api/link/delete.post.ts` | authenticated CRUD selects a bare slug | operation is ambiguous when one workspace owns the slug on multiple domains | select by globally unique `link.id`; create and redirects still use domain + slug |
| `api/link/check.post.ts:44,185` | check targets/results are `{ slug, url }` | results table merges or misattributes rows across domains | carry `link.id` |
| `api/stats/[action].get.ts:52` | `.groupBy(['slug', 'url'])` for CSV export | click counts of same-slug links **summed together** | group by the domain blob too (§7) |
| `app/components/dashboard/links/Index.vue:51` | infinite scroll dedupes with `new Set(link.slug)` | second same-slug link **silently vanishes** from the list | dedupe by `link.id` |
| `app/pages/dashboard/link.vue`, `app/components/dashboard/links/{Link,SearchDialog}.vue` | dashboard navigation and component keys carry only slug | detail, edit, and delete can target the wrong link and search rows collide | carry `link.id` in dashboard routes/actions and key rows by id |
| `app/utils/dashboard-query.ts:63` `toSlugFilters` | builds a comma-joined slug filter for analytics | filter matches links in other domains | filter by globally unique link id (`blob17`) |
| `utils/webhook.ts:23,38` | payload carries `Pick<Link, 'id' \| 'slug'>` | consumers cannot tell which domain fired | add `domain` + full short link (breaking payload change — version it) |
| `utils/link-store.ts:30` `buildShortLink` | builds from the **request host** | short link shown for the wrong domain | build from the link's domain (already §9) |
| `api/link/import.post.ts:106-120` | reports failed/skipped items by slug | ambiguous reporting only | cosmetic; include domain for clarity |

Two conclusions worth stating: the collisions are the *point* of multi-domain, so none of these
are arguments against the design; and `links.id` is already globally unique and indexed, which
makes it the natural replacement key nearly everywhere. Prefer it over composite `(domain, slug)`
tuples in application code.

## 13. Decision log

All decisions below are closed. Kept as a record of what was chosen and why.

1. ~~**Reference model**~~ — decided: workspaces with shared membership. Strict per-user tenancy
   is ruled out by the brief itself: roles, invitations, and a permission matrix only mean
   something when more than one person can be in a tenant. Users may belong to several
   workspaces, with one active at a time.
2. ~~**Auth library**~~ — decided: pinned better-auth core with first-party D1 support plus its
   organization and API-key plugins (§4). Drizzle owns the committed schema migrations. Hash CPU
   and bundle measurements remain in Phase 0.
3. ~~**Existing deployment migration**~~ — decided: unsupported. The fork requires fresh D1,
   KV, Analytics Engine, and R2 resources and removes all legacy migration machinery (§8).
4. ~~**Domain onboarding**~~ — decided: `wrangler.jsonc` routes only. Domains are operator-set;
   no self-serve, no verification, no Cloudflare for SaaS (§6).
5. ~~**Analytics storage**~~ — decided: a fresh `sink_multitenant` dataset indexed by workspace,
   with link/domain/schema version in blobs. There is no historical dataset read (§7).
6. ~~**Initial domains**~~ — decided: bootstrap creates rows only for explicitly configured
   Worker routes and requires the operator to choose the primary. No hostname is hard-coded as
   primary, and domains with links cannot be reassigned.
7. ~~**Slug collisions**~~ — audited, see §12. Authenticated application flows use `links.id` as
   identity; public redirect lookup alone uses `(domain_id, slug)`. All listed collision sites are
   Phase 3 work with a known fix.
8. ~~**Enrollment and recovery**~~ — decided: invite-only by default, one-time first-owner
   bootstrap, Resend-backed verified email/password flows when configured, and issuer+subject
   Cloudflare Access identities with no email-only automatic account merge (§4).
9. ~~**Public assets**~~ — decided: mutations and enumeration are tenant-authorized; immutable
   reads use unguessable public URLs so short links and social-preview bots continue to work.
