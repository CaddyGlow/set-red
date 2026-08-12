# Cloudflare Access parity and platform administration plan

## 1. Purpose

This plan completes two related product surfaces after the multitenant foundation:

1. Cloudflare Access users must have the same product-level workspace capabilities as users who
   authenticate with a Better Auth session, subject to the same workspace role and permissions.
2. Instance administrators need a dedicated, audited console for operating users, workspaces,
   domains, and platform-level security state.

The work builds on `MULTITENANCY_PLAN.md`. It does not redesign link storage, analytics tenancy,
or the existing workspace role matrix.

## 2. Current state and gaps

The current implementation already has:

- `AuthContext.method` values for `session`, `api-key`, `access-user`, and `access-service`.
- Workspace roles and permissions from the declarative statement in
  `shared/auth/permissions.ts`.
- A verified Cloudflare Access identity linked by issuer plus subject.
- Idempotent automatic owner-workspace creation for an Access user with no memberships.
- Workspace-scoped link, analytics, settings, domain, API-key, upload, and backup operations.
- An `isInstanceAdmin` flag and instance-admin-only domain creation, assignment, and removal APIs.
- Workspace settings pages for members, domains, API keys, and workspace configuration.
- Audit writes for security-sensitive workspace and domain mutations.

The remaining gaps are:

- `requireUserSession()` rejects `access-user`, even for product operations that only need an
  interactive user and do not need a Better Auth session.
- The workspace switcher always calls Better Auth's session-only organization endpoint.
- Access workspace selection is not persisted; the server currently selects an arbitrary first
  membership.
- Access users cannot create, rename, delete, invite to, or fully administer workspaces through
  the existing wrappers.
- The workspace middleware currently treats `x-workspace-id` from an instance administrator as a
  bypass on ordinary workspace routes, so instance privilege and membership privilege are not yet
  separated at a route boundary.
- Instance-admin APIs are mixed into workspace domain routes and do not provide platform-wide
  listing, search, pagination, or consistent audit behavior.
- There is no platform-admin navigation or UI.
- There is no supported UI for granting or revoking instance-admin status.
- There is no platform-wide audit viewer or operational overview.

## 3. Goals

### 3.1 Cloudflare Access parity

- Treat a verified Access user as an interactive user for product-owned operations.
- Keep permissions determined only by the active workspace membership.
- Persist the active workspace for Access identities and restore it on later requests.
- Make workspace creation, switching, settings, member management, invitations, and API keys work
  for Access users where their role permits them.
- Preserve the issuer-plus-subject account-linking rule. Never merge accounts by email alone.
- Keep automatic workspace provisioning idempotent under concurrent first requests.

### 3.2 Platform administration

- Provide instance administrators with a dedicated `/dashboard/admin/**` console.
- Support searchable, paginated views of workspaces, users, domains, and audit records.
- Support safe instance-admin promotion and demotion with a last-admin invariant.
- Support operator domain creation, assignment, disabling, and deletion through explicit task
  dialogs.
- Make all platform mutations fail closed, validate exact targets, and write an audit record.
- Clearly separate instance-level actions from workspace-level settings.

### 3.3 Operational quality

- Preserve cross-tenant isolation and least privilege.
- Make every mutation retry-safe or return a deterministic conflict.
- Provide regression coverage for every authentication method and destructive invariant.
- Roll out additively without invalidating current sessions, API keys, links, or domain caches.

## 4. Non-goals

The first delivery does not include:

- Billing, plans, quotas, metering, or payment-provider integration.
- User impersonation or “log in as user.”
- Arbitrary SQL, KV, R2, or Analytics Engine browsers.
- Domain ownership verification or Cloudflare for SaaS automation.
- Moving domains that still own links or bypassing the cache-drain window.
- Account merging based only on matching email addresses.
- Editing Better Auth credentials, password hashes, verification tokens, or sessions from the
  admin console.
- A generic policy engine beyond the existing role matrix and instance-admin flag.

## 5. Authorization model

### 5.1 Principal categories

Keep authentication method and authorization capability separate:

| Principal                          | Interactive user |               Workspace membership | Instance administration |
| ---------------------------------- | ---------------: | ---------------------------------: | ----------------------: |
| Better Auth session                |              yes |     required for workspace actions |  when user flag is true |
| Cloudflare Access user             |              yes |     required for workspace actions |  when user flag is true |
| Workspace API key                  |               no | bound workspace and explicit grant |                   never |
| Configured Access service identity |               no |    none unless explicitly targeted |                     yes |

Add these server helpers in `server/utils/auth-context.ts`:

- `requireInteractiveUser(event)` accepts `session` and `access-user` and returns a non-null user.
- `requireSessionUser(event)` replaces the ambiguous `requireUserSession` name and is used only
  when calling a Better Auth API that requires its session cookie.
- `requireInstanceAdmin(event)` accepts an instance-admin user or the configured Access service
  identity.
- `requireInstanceAdminUser(event)` requires a real interactive user and is used for actions such
  as changing another user's instance-admin status.

Workspace permissions remain authoritative for workspace actions. `isInstanceAdmin` must not
implicitly turn every workspace UI action on. Remove the generic instance-admin branch from
`server/middleware/3.workspace.ts`: ordinary `/api/workspaces/**`, `/api/link/**`, settings, member,
domain, analytics, upload, and backup routes always require membership and apply the member's role,
even when the caller is an instance administrator and sends `x-workspace-id`.

Instance bypass exists only inside `/api/admin/**`. Those routes call an explicit platform service
with a validated target ID; they do not gain access by mutating the ordinary workspace context.
The configured Access service identity is likewise accepted only by `/api/admin/**` and other
explicitly documented machine-oriented platform routes. Presence of `x-workspace-id` alone never
activates instance privilege.

### 5.2 CSRF and request safety

All cookie or Access-header authenticated mutations must pass the existing same-origin and
`Sec-Fetch-Site` safety checks. API-key requests remain bearer-authenticated and do not use browser
cookies. Platform routes never accept a workspace API key.

Direct Better Auth organization and API-key mutations remain blocked. Product wrappers own
authorization, invariants, and audit logging.

### 5.3 Last-administrator invariant

At least one email-verified instance administrator must remain. There is no separate enabled-user
state in the current schema, so this invariant must not refer to one. Promotion rejects an
unverified target. Demotion uses one guarded D1 update, equivalent to:

```sql
UPDATE user
SET is_instance_admin = 0, updated_at = ?
WHERE id = ?
  AND is_instance_admin = 1
  AND EXISTS (
    SELECT 1 FROM user AS other
    WHERE other.id <> user.id
      AND other.is_instance_admin = 1
      AND other.email_verified = 1
  )
```

D1 serializes the guarded write; the existence predicate is not evaluated in an earlier application
query. Run that statement and an `audit_logs` insert in one D1 batch, with the insert conditional on
the immediately preceding statement changing one row. A zero-row result is a deterministic 409 for
last-admin, stale-target, and already-demoted cases, distinguished by a read after the failed batch
when needed. Promotion uses the same guarded/idempotent service shape.

The service:

1. Resolves the exact target user.
2. Applies the guarded update without a count-then-write race.
3. Rejects demotion when it would remove the last instance administrator.
4. Writes the audit event in the same batch.
5. Revokes or refreshes authorization state so the change takes effect promptly.

Self-demotion is allowed only when another verified instance administrator remains. Better Auth
session cookie caching remains disabled, and both session and Access-user authentication reload the
user row on every request, so demotion takes effect on the next request. Deleting or suspending users
is not part of the first delivery.

## 6. Data model

### 6.1 User preferences

Add `user_preferences`:

| Column                | Constraint                                        | Purpose                    |
| --------------------- | ------------------------------------------------- | -------------------------- |
| `user_id`             | primary key, FK to `user`, cascade delete         | preference owner           |
| `active_workspace_id` | nullable FK to `organization`, set null on delete | Access workspace selection |
| `updated_at`          | required timestamp                                | conflict/debug visibility  |

Add `workspace_deletion_jobs` for retry-safe cross-storage deletion:

| Column                                 | Constraint                                        | Purpose                                            |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `workspace_id`                         | primary key, FK to `organization`, cascade delete | workspace being deleted                            |
| `requested_by_type`, `requested_by_id` | required                                          | initiating principal snapshot                      |
| `workspace_slug`                       | required                                          | confirmation and audit snapshot                    |
| `state`                                | `pending` or `purging`                            | blocks normal workspace use and drives cleanup     |
| `storage_drain_until`                  | required timestamp                                | bounds R2 writers already in flight                |
| `last_error_code`                      | nullable, bounded                                 | operational retry state without secret/error dumps |
| `created_at`, `updated_at`             | required timestamps                               | recovery and monitoring                            |

The existence of a deletion job is the workspace's deleting state. Workspace middleware rejects
new mutations and ordinary reads for it with a deterministic 409, while the deletion-status endpoint
and cleanup worker remain available. No Better Auth organization extension is required.

Extend `invitation` with `delivery_status` (`pending`, `sent`, `failed`),
`delivery_attempts`, and `last_delivery_attempt_at`. Normalize invitation email addresses to
lowercase and add a partial unique index on `(organization_id, email)` for rows whose status is
`pending`, so retries cannot create two live invitations for the same address.

Add `audit_logs.workspace_ref`, a nullable, non-FK workspace-ID snapshot. Backfill it from
`workspace_id`, write both columns for new workspace events, and use `workspace_ref` for admin
filtering. `workspace_id` may still become null through `ON DELETE SET NULL`; `workspace_ref` must
survive workspace deletion. Add `audit_logs_workspace_ref_created_at_id_idx` on
`(workspace_ref, created_at, id)` because it directly supports the required filtered cursor query;
retain an equivalent `(created_at, id)` index for the global audit stream.

Better Auth session users continue using `session.active_organization_id`. Access users use
`user_preferences.active_workspace_id`. `/api/verify` presents one unified `workspaceId` regardless
of storage mechanism.

If the stored workspace no longer exists or the user is no longer a member, middleware clears the
preference and chooses a deterministic remaining membership ordered by membership creation time
and workspace ID. If no membership exists, automatic provisioning runs.

### 6.2 Automatic Access workspace provisioning

Keep deterministic IDs and conditional D1 batch inserts. Harden the service so it:

- Checks a valid stored selection first.
- Checks existing memberships before creating anything.
- Creates organization, owner membership, settings, preference, and audit record together.
- Uses deterministic identifiers per user to make retries and overlapping requests idempotent.
- Returns the created or existing workspace and expanded owner permissions.
- Never grants instance-admin status and never assigns an operator domain.

Default generated names follow `"<display name>'s Workspace"`. Generated slugs use a normalized
display-name prefix plus a stable user-ID suffix. Users may rename the workspace later.

### 6.3 Platform audit metadata

No new audit table is required. Continue using `audit_logs`, with a null `workspace_id` allowed for
truly platform-wide events and `workspace_ref` preserving the historical tenant association.
Standardize metadata and actions:

- `instance-admin.grant`
- `instance-admin.revoke`
- `platform.workspace.inspect`
- `platform.workspace.disable` if a disable feature is added later
- `domain.create`
- `domain.assign`
- `domain.disable`
- `domain.delete`
- `workspace.access-provision`
- `workspace.delete.request`
- `workspace.delete.complete`
- `invitation.delivery-failed`

Audit metadata may contain IDs, role transitions, hostnames, and changed field names. It must not
contain API-key secrets, tokens, password material, full request headers, or email content.

Commit the generated Drizzle migration and update tests to apply it normally.

## 7. Workspace-selection contract

Add one product-owned endpoint:

`PUT /api/workspaces/active`

Request:

```json
{ "workspaceId": "workspace-id" }
```

Behavior:

- Requires an interactive user.
- Verifies membership before changing state.
- For `session`, calls or updates the Better Auth active organization through the authorized
  wrapper.
- For `access-user`, upserts `user_preferences.active_workspace_id`.
- Returns the refreshed `VerifyResponse` so the client updates auth, role, permissions, and
  workspace lists atomically.
- Audits failed instance-admin bypass attempts, but ordinary member workspace switching does not
  need a persistent audit row.

Update `useAuthSession.setActiveWorkspace()` to call only this endpoint. Do not branch on auth
method in Vue components.

The `x-workspace-id` header remains supported for explicit API clients, but it always undergoes the
same membership check as a persisted selection. Platform-admin routes carry target IDs in their
validated path, query, or body schemas instead. Browser workspace selection should use the persisted
endpoint rather than local storage.

## 8. Access-compatible workspace services

Refactor route logic into product-owned services before widening guards. Do not simply replace
every `requireUserSession()` call.

### 8.1 Safe to make interactive-user neutral

- List the user's workspaces.
- Create a workspace and owner membership.
- Rename a workspace.
- Update workspace settings.
- Delete a workspace after domain/link/last-owner checks.
- List members and invitations.
- Change roles and remove members with existing owner invariants.
- List, create, and revoke product API keys when the Better Auth API-key call does not require a
  browser session.

### 8.2 Invitations

The current invitation creation wrapper calls Better Auth with session headers. Extract a
product-owned invitation service that accepts an already authorized actor:

- Generate and persist the invitation through a server API that does not infer authorization from
  Better Auth session cookies, or add a supported internal Better Auth context explicitly.
- Preserve invitation expiry, email ownership checks, verification requirements, and one-time
  acceptance.
- Send mail only after persistence succeeds.
- Treat a persisted invitation as a successful mutation even when delivery fails: return the
  invitation with `deliveryStatus: 'failed'` rather than an ambiguous 5xx, and retain it.
- On a retry for the same normalized workspace/email pair, return or resend the existing pending
  invitation instead of creating another. A different requested role returns 409 until the old
  invitation is canceled.
- Add `POST /api/workspaces/:id/invitations/:invitationId/resend`, with a bounded resend interval.
  It updates delivery status and attempts without changing the invitation ID or expiry unless the
  invitation has explicitly expired and is replaced.
- Audit creation, cancellation, registration, acceptance, and delivery failure.

Do not manufacture a fake session cookie for an Access identity.

### 8.3 Workspace deletion

Workspace deletion is asynchronous because D1 and R2 cannot participate in one transaction. Before
creating a deletion job, require:

- The actor has `workspace.delete` or is using an explicit platform-admin operation.
- At least one confirmation field matching the workspace slug.
- No active domains, or an explicit prior domain reassignment/removal workflow.
- No domain with links.

`DELETE /api/workspaces/:id` validates the slug confirmation, creates
`workspace_deletion_jobs` and the `workspace.delete.request` audit row in one D1 batch, and returns 202. Repeating the same request returns the existing job; a conflicting target or confirmation is 409. Once a job exists, no new workspace uploads, backups, domains, links, invitations, memberships,
settings changes, or API keys may be created. D1 mutations use a guarded write that checks for the
absence of a deletion job in the same statement or batch; a separate preflight read is insufficient.

R2-writing operations have an enforced maximum duration and recheck deletion state immediately
before their final object write. Scheduled backups exclude deleting workspaces. The deletion job's
`storage_drain_until` is later than that maximum duration, and cleanup does not begin before it, so
an upload or backup that started before the job cannot write behind the cleanup pass.

A scheduled cleanup service repeatedly lists from the beginning and deletes bounded pages under
both `uploads/${workspaceId}/` and `backups/${workspaceId}/`. It deliberately does not advance an R2
cursor after deleting a page, which avoids skipping keys as the listing changes. Empty passes for
both prefixes are required before finalization. Finalization rechecks that both prefixes are empty,
then uses one D1 batch to write `workspace.delete.complete` with the durable `workspace_ref` and
delete the organization; domain/link preconditions are rechecked immediately before that batch.
Foreign-key cascades remove memberships, settings, invitations, API keys, and the deletion job.
Failures retain the job and a bounded error code for the next scheduled or operator-triggered retry.
Session and preference active-workspace foreign keys are set null rather than deleting their rows.
The requesting owner polls `GET /api/workspaces/:id/deletion`; an instance administrator may also
use `GET /api/admin/workspaces/:id/deletion` and
`POST /api/admin/workspaces/:id/deletion/retry`.

All callers use this one service so UI, session users, and Access users share the same invariants.

## 9. Platform-admin API

Create routes under `/api/admin/**`. Every route calls `requireInstanceAdmin`; mutation routes also
apply browser request-safety checks and audit success and rejected invariant-sensitive attempts.

### 9.1 Overview

`GET /api/admin/overview`

Returns bounded counts only:

- users and verified users
- instance administrators
- workspaces
- active and disabled domains
- links
- pending invitations
- API keys, split between user-owned and independent service keys

No analytics scan is required for the first version.

### 9.2 Users

- `GET /api/admin/users?cursor=&limit=&q=&admin=`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id/instance-admin`

List rows include ID, name, email, verification state, instance-admin state, created date, auth
provider names, workspace count, and last session date when available. Never return account tokens,
password hashes, session tokens, API-key hashes, or verification values.

The patch body is `{ "enabled": true | false }` and enforces the last-admin invariant.

### 9.3 Workspaces

- `GET /api/admin/workspaces?cursor=&limit=&q=`
- `GET /api/admin/workspaces/:id`
- `PATCH /api/admin/workspaces/:id`
- `DELETE /api/admin/workspaces/:id`

Summary rows include member, owner, domain, link, and API-key counts. Detail includes settings with
secrets masked, members, domains, and recent audit entries. The platform patch initially supports
name and slug only. Deletion uses the shared asynchronous deletion service and explicit
confirmation. Deleting workspaces remain visible with their job state until finalization.

### 9.4 Domains

- `GET /api/admin/domains?cursor=&limit=&q=&status=&workspaceId=`
- `POST /api/admin/domains`
- `PATCH /api/admin/domains/:id/assignment`
- `DELETE /api/admin/domains/:id`

Keep workspace-level `PATCH /api/domains/:id` for primary, home URL, not-found redirect, and status
changes by workspace owners/admins. Move or alias instance-wide mutations to `/api/admin/domains`
and deprecate the mixed old paths after the UI and tests migrate.

Domain operations retain exact-host canonicalization, duplicate 409 responses, disable/cache-drain
requirements, and the prohibition on moving or deleting domains with links.

### 9.5 Audit records

`GET /api/admin/audit?cursor=&limit=&workspaceId=&actorId=&action=&from=&to=`

Use stable descending pagination by `(created_at, id)`. Filter historical workspace records by
`workspace_ref`, not the nullable FK column. Return parsed, schema-limited metadata.
Default and maximum limits must prevent unbounded D1 reads. There is no audit delete endpoint.

## 10. Shared schemas and response types

Add strict Zod request/query schemas under `shared/schemas/admin.ts` and reuse existing workspace and
domain schemas where their contracts match. Add public response types under `shared/types/admin.ts`.

Rules:

- All list endpoints use opaque, versioned cursors.
- Search strings are trimmed and length-bounded.
- IDs are length-bounded strings; never interpolate them into SQL.
- Sort fields and filters are enums, not arbitrary column names.
- Sensitive database fields are omitted in the select statement, not removed after serialization.
- Mutation schemas are `.strict()` and require at least one actual change.

## 11. Platform-admin interface

Read `DESIGN.md` before implementation. Do not edit `app/components/ui/**` and do not introduce new
design tokens.

### 11.1 Information architecture

Add an Administration section visible only when `auth.isInstanceAdmin`:

- `/dashboard/admin` — overview
- `/dashboard/admin/workspaces` — workspace registry
- `/dashboard/admin/users` — user registry and instance-admin status
- `/dashboard/admin/domains` — operator domain registry and assignment
- `/dashboard/admin/audit` — audit explorer

Use `SidebarMenu`, `SidebarMenuItem`, and `SidebarMenuButton` in the existing sidebar. The server
remains authoritative; hidden navigation is not an authorization control.

### 11.2 Overview page

Use compact cards for bounded counts and a recent security-events list. Avoid charts unless a
time-series API is added later. Include direct links to filtered user, workspace, domain, and audit
views.

### 11.3 Registries

Use reusable app-owned table/list components outside `app/components/ui/**` with:

- server-side cursor pagination
- debounced, abortable search through `useAPI()`
- filter controls reflected in the URL query
- explicit empty, loading, and error states
- row links to detail pages or task dialogs
- responsive card fallback when a wide table is not usable

Use `DropdownMenu` for compact row actions. Use `ResponsiveModal` for create/edit/assign tasks and
`AlertDialog` for destructive confirmation.

### 11.4 Forms and dialogs

Create dedicated components using `@tanstack/vue-form`:

- `AdminDomainForm.vue`
- `AdminDomainAssignmentForm.vue`
- `AdminWorkspaceForm.vue`
- `InstanceAdminStatusForm.vue`

Create dedicated confirmation dialogs:

- `AdminDomainDeleteDialog.vue`
- `AdminWorkspaceDeleteDialog.vue`
- `InstanceAdminStatusDialog.vue`

Destructive dialogs state the exact effect and require the target hostname, workspace slug, or
user email where appropriate. Forms disable repeat submission and surface 409 invariant conflicts
without discarding user input.

### 11.5 Workspace switcher

Keep the existing `DropdownMenu`. Switch through `PUT /api/workspaces/active`, refresh the unified
auth response, navigate to `/dashboard/links`, then refresh workspace-scoped AsyncData. Display a
create-workspace action only for interactive users and place its form in a dedicated responsive
modal.

### 11.6 Localization

Add an `admin.json` module to every locale directory and register it in `i18n/i18n.ts`. Keep all
keys and interpolation placeholders aligned across locales. Workspace parity strings remain in the
existing `workspace.json` and `auth.json` owning modules.

Run `pnpm locales:check` after every locale change.

## 12. Security and privacy requirements

- Platform APIs reject API keys even if their grant contains every workspace permission.
- Access service identities may perform machine-oriented platform operations but do not receive a
  browser UI or user-only administration actions.
- Instance-admin status is reloaded on each request or invalidated promptly; it must not remain
  trusted indefinitely in client state.
- Platform detail endpoints use explicit field projections.
- Error responses do not reveal whether an email exists to non-admin callers.
- Audit metadata is treated as untrusted display data and rendered as text.
- Mutations use guarded updates or D1 batches for last-admin, last-owner, and optimistic concurrency
  invariants.
- No destructive bulk actions are included initially.
- Domain cache invalidation and the 60-second drain marker remain mandatory.
- Workspace deletion must not orphan domains, links, API keys, uploads, or backups.
- Anonymous asset reads for a deleting workspace may continue only until its upload prefix has been
  purged; successful deletion requires an empty prefix, so no public asset survives completion.
- Admin list queries have supporting indexes where query plans demonstrate a need; do not add
  speculative indexes without measuring D1 queries.

## 13. Testing strategy

### 13.1 Authorization matrix

Parameterize relevant routes across:

- session owner/admin/member/viewer
- Access owner/admin/member/viewer
- workspace API key
- instance-admin session user
- instance-admin Access user
- configured Access service identity
- anonymous request

Assert both status and absence of side effects.

### 13.2 Access parity

- Concurrent first requests create exactly one workspace, owner membership, settings row,
  preference row, and provisioning audit event.
- Existing membership prevents automatic creation.
- Stored active workspace is restored.
- Removed membership clears stale selection and chooses a deterministic remaining workspace.
- Access users can create, rename, switch, configure, and delete a workspace according to role.
- Access owners/admins can invite, change roles, remove members, and manage keys.
- Access members/viewers receive the same denials as session users.
- Switching never permits a non-member workspace ID.

### 13.3 Platform administration

- Every `/api/admin/**` route rejects non-instance admins and API keys.
- User/workspace/domain/audit searches remain scoped to the requested filters and paginate without
  duplicates or omissions.
- The last instance administrator cannot be demoted.
- A second administrator can demote the first and the change takes effect on the next request.
- Two concurrent attempts to demote the only two administrators result in exactly one administrator
  remaining and exactly one successful audit row.
- Workspace deletion confirmation and dependency checks fail before writes.
- Workspace deletion is idempotent, blocks new workspace writes, resumes after injected R2 failures,
  purges both prefixes, and preserves workspace-filterable audit history after finalization.
- Domain duplicate, active-domain, link-owned, and cache-drain conflicts return 409.
- Every successful mutation creates one audit row with no secret material.

### 13.4 UI tests

- Admin navigation is visible only to instance admins.
- Direct navigation as a non-admin renders the authorized 403/not-found state and exposes no data.
- Search aborts stale requests and URL filters survive reload.
- Dialog focus returns to the initiating action.
- Destructive submit stays disabled until confirmation matches.
- Access workspace switching does not call Better Auth's session-only route.
- A non-member instance administrator and an instance administrator with a lower workspace role
  cannot use `x-workspace-id` to bypass ordinary workspace routes.

### 13.5 Full verification

After server changes:

```bash
pnpm db:generate
pnpm types:check
pnpm lint
pnpm locales:check
NUXT_TELEMETRY_DISABLED=1 pnpm build
WRANGLER_LOG_PATH=/tmp/urlshort-wrangler.log pnpm test --run
git diff --check
```

Worker tests must use the freshly built `.output/server/index.mjs`.

## 14. Delivery phases

### Phase A — auth vocabulary and persistent selection

- Add `user_preferences` migration.
- Add interactive-user and instance-admin helpers.
- Add unified active-workspace service and endpoint.
- Remove the generic instance-admin workspace bypass and update middleware, `/api/verify`, client
  session state, and workspace switcher.
- Harden automatic Access workspace provisioning.
- Add concurrency, stale-selection, and cross-membership tests.

Exit criterion: Access and session users can reliably restore and switch among memberships without
auth-method-specific UI code.

### Phase B — workspace operation parity

- Extract product-owned workspace/member/invitation services.
- Replace session-only guards where Better Auth session state is not actually required.
- Apply the invitation delivery-state/index migration and implement the Access-compatible,
  idempotent invitation path.
- Add workspace creation UI and complete role-matrix tests for both interactive methods.

Exit criterion: the same role produces the same product behavior for session and Access users.

### Phase C — platform read APIs and shell

- Apply the durable audit-reference/index migration and add overview, user, workspace, domain, and
  audit read endpoints.
- Add admin route middleware and sidebar navigation.
- Build overview and read-only registry pages with pagination and search.

Exit criterion: instance admins can inspect platform state without direct D1 access, while all
non-admin principals are denied.

### Phase D — platform mutations

- Add instance-admin status service and UI.
- Move instance-level domain actions under `/api/admin/domains` and build task dialogs.
- Apply the deletion-job migration and add safe workspace update/delete operations.
- Add the deletion-job cleanup service, status UI, and R2 failure recovery.
- Complete mutation auditing and invariant tests.

Exit criterion: routine platform operation no longer requires Wrangler/D1 commands.

### Phase E — hardening, documentation, and rollout

- Run full verification and targeted production smoke tests.
- Document Access auto-provisioning, workspace selection, and admin operations in English and
  Chinese documentation trees.
- Deploy each additive phase migration before the code that depends on it.
- Verify the existing instance administrator, expected production memberships, active domains, and
  audit visibility using deployment-specific smoke-test inputs rather than hard-coded tenant names.
- Monitor 401/403/409/5xx rates and D1 query latency after deployment.

Exit criterion: production operation is documented, reversible at the Worker-version level, and
does not require schema rollback.

## 15. Rollout and recovery

1. Back up the production D1 database before applying the new migration.
2. Apply the additive Phase A `user_preferences` migration.
3. Deploy Phase A code with old session behavior still supported.
4. Smoke-test `/api/verify`, workspace selection, link listing, settings, and member listing as both
   a session user and Access user.
5. Apply Phase B's invitation delivery-state/index migration, deploy Phase B, and smoke-test
   invitation creation, failure, resend, and retry as both interactive authentication methods.
6. Apply the durable audit-reference/index migration, then deploy read-only admin APIs/UI before
   enabling admin mutations.
7. Apply the deletion-job migration, then enable mutations after audit, concurrent last-admin, and
   resumable R2 cleanup tests pass in production-like bindings.
8. Keep the prior Worker version available for rollback. The additive tables can remain if code
   rolls back.

Do not roll back by deleting the preference table or rewriting migration history. If a platform
mutation must be disabled quickly, remove its UI affordance and return a controlled 503 from the
specific mutation route while preserving read access.

## 16. Documentation updates

Update together with implementation:

- `docs/configuration/cloudflare-access.md` and Chinese counterpart: Access identity linking,
  automatic workspace provisioning, and switching.
- `docs/multitenancy.md`: current migration count, initial-admin workflow, and domain assignment.
- `docs/guide/architecture.md`: unified interactive-user model and preference storage.
- `docs/api/index.md`: product workspace-selection and admin endpoint summaries.
- `docs/deployment/workers.md`: migration-first rollout and admin smoke checks.
- `docs/faqs.md`: recovery for no workspace, stale selection, and lost last-admin access.

## 17. Definition of done

The project is complete when:

- Access and session users with the same workspace role have equivalent product permissions.
- Access users can create, persistently select, administer, and delete workspaces within the role
  matrix.
- Instance admins can operate users, workspaces, domains, and audit records from the dashboard.
- At least one instance administrator and one workspace owner are always preserved.
- Platform APIs expose no credential or token material.
- Every platform mutation is audited and regression-tested.
- Full lint, typecheck, locale, build, and test verification passes.
- Production documentation matches the deployed behavior.

## 18. File-level implementation map

Expected additions and primary edits:

- `server/database/schema.ts` and `drizzle/**` — user preferences, invitation delivery state,
  durable audit references/indexes, and workspace deletion jobs.
- `server/utils/auth-context.ts` — principal-specific guards.
- `server/middleware/2.auth.ts` and `server/middleware/3.workspace.ts` — identity and active
  workspace resolution.
- `server/services/access-workspace.ts` — provisioning and Access selection.
- `server/services/workspace.ts` — shared workspace lifecycle and invariants.
- `server/services/workspace-deletion.ts` — deletion jobs, bounded R2 cleanup, and finalization.
- `server/services/membership.ts` — role/remove/last-owner operations.
- `server/services/invitation.ts` — auth-method-neutral invitation lifecycle.
- `server/services/instance-admin.ts` — admin grant/revoke and last-admin invariant.
- `server/api/workspaces/active.put.ts` — unified switching.
- `server/api/admin/**` — platform APIs.
- `shared/schemas/admin.ts` and `shared/types/admin.ts` — strict contracts.
- `app/composables/useAuthSession.ts` — unified switching and refreshed context.
- `app/components/dashboard/sidebar/**` — conditional admin navigation.
- `app/pages/dashboard/admin/**` and `app/components/admin/**` — console pages, forms, dialogs,
  registries, and empty/error states.
- `i18n/locales/*/admin.json` and `i18n/i18n.ts` — aligned admin messages.
- `tests/api/access-workspace.spec.ts`, `tests/api/admin-*.spec.ts`, and RBAC suites — regression
  coverage.
