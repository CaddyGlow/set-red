# Workspace Settings Implementation Plan

## Goal

Make workspace settings safe under concurrent operations, provide a complete settings experience, and finish the owner-only workspace lifecycle without weakening workspace-deletion, ownership, link-resolution, or secret-handling invariants.

## Authorization contract

Use these rules consistently in APIs, UI affordances, and tests:

- Reading ordinary workspace settings requires `links.read` and an active workspace. Session users, Cloudflare Access users, and API keys may read them when their resolved permissions include it.
- Updating link defaults or the webhook URL requires `workspace.settings`. Session users, Cloudflare Access users, and explicitly authorized API keys may perform these non-secret updates.
- Rotating or removing a webhook secret requires `workspace.settings` and an interactive session or Cloudflare Access user. API keys and Access service identities cannot manage secrets.
- Updating workspace name or slug requires `workspace.settings` and an interactive user.
- Ownership transfer and workspace deletion require an interactive owner with `workspace.transfer` or `workspace.delete`, respectively.
- Access service identities cannot use workspace-facing mutation endpoints. Instance-administrator routes retain their existing separate authorization contract.

The UI must derive visibility and disabled states from the same permission model, but server authorization remains authoritative.

## 1. Enforce workspace-deletion invariants

### Settings writes

- Add a `NOT EXISTS` deletion-job predicate directly to every `workspace_settings` update query.
- Return `409 Workspace deletion is in progress` when an update matches no row because a deletion job exists.
- Distinguish deletion conflicts from missing workspace settings.
- Include changed field names in `workspace.settings.update` audit metadata, excluding `webhookSecret` and all values.

### Workspace-targeted write audit

Audit every workspace-targeted mutation path, including:

- Workspace identity updates.
- Link create, edit, upsert, import, and delete operations.
- Domain creation, update, assignment, and deletion.
- Invitation creation, resend, and cancellation.
- Member role changes and removal.
- API-key creation and revocation.
- Webhook URL and secret operations.
- Ownership transfer.

Each database mutation must contain an atomic deletion-job predicate or use an existing database-level guard. Middleware checks are an early rejection only and are not sufficient protection from races. Deletion status and retry endpoints are the only workspace-facing exceptions.

### Acceptance criteria

- No workspace mutation can commit after its deletion job has been created.
- A mutation that loses a race with deletion returns a deterministic conflict.
- Settings audit records list changed non-secret field names without recording values.

## 2. Make case-sensitivity transitions safe

### Transition policy

- Changing from case-insensitive to case-sensitive is allowed. Existing lowercase slugs remain valid.
- Changing from case-sensitive to case-insensitive is allowed only when every stored slug in the workspace is already lowercase.
- If any stored slug is not lowercase, reject the transition with `409` and return a non-sensitive collision summary containing the number of incompatible links. Do not expose destination URLs.
- The UI must explain that uppercase or mixed-case slugs must be renamed before case-insensitive matching can be enabled.

This policy avoids a partial slug migration, primary-key rewrites, stale KV aliases, and ambiguous redirects.

### Concurrency contract

- The settings update must atomically assert that no non-lowercase slug exists when enabling case-insensitive matching.
- Link create, upsert, import, and edit statements must consult the current database setting as part of the write. If the database is case-insensitive, an uppercase or mixed-case slug cannot be inserted even when the request loaded stale settings.
- Keep client/request normalization for convenience, but do not rely on request context as the write invariant.
- Verify that D1 and KV use the same normalized slug for all successful writes and reads.
- The setting transition must not require cache invalidation because the accepted precondition guarantees all stored keys are already lowercase.

### Acceptance criteria

- Enabling case-insensitive matching cannot leave an unreachable or ambiguous stored slug.
- Concurrent setting changes and link writes cannot introduce a mixed-case slug into a case-insensitive workspace.
- Create, edit, upsert, import, authoritative reads, KV reads, and redirects follow the same case contract.

## 3. Define webhook URL and secret contracts

### Webhook URL policy

Accept only URLs that meet all of these requirements:

- Protocol is HTTPS.
- Username and password are absent.
- Hostname is present and is not `localhost` or a `.localhost` name.
- IP-literal hosts are rejected when they are loopback, private, link-local, multicast, unspecified, documentation-only, or otherwise non-public IPv4 or IPv6 ranges.
- Delivery continues to use `redirect: 'manual'`; redirects are never followed.

Apply the same reusable validator when saving settings and immediately before delivery. Existing invalid persisted URLs remain readable but must be corrected before any settings save that includes the URL; delivery rejects them safely.

### Secret lifecycle

- Remove `webhookSecret` from the ordinary settings update schema and form.
- Return only `webhookSecretConfigured: boolean` from settings reads.
- Add explicit rotate and remove endpoints.
- Rotation generates the secret on the server as `whsec_` plus cryptographically secure base64 data in the format already accepted by webhook signing.
- Return a newly rotated secret exactly once from the rotation response.
- Removing a secret sets it to `null` and returns only its configured state.
- Both operations use an atomic deletion-job guard.
- Audit only `webhook.secret.rotate` or `webhook.secret.remove`; never record the secret.
- Never include persisted secrets in ordinary API responses, logs, errors, audit metadata, or client state after the one-time rotation display is dismissed.

### Acceptance criteria

- Unrelated settings saves preserve the existing secret.
- Secret rotation and removal are intentional, separately authorized operations.
- Stored secrets always satisfy the delivery format.
- Unsafe webhook destinations are rejected at save and delivery time.

## 4. Add safe workspace identity editing

- Add workspace name and slug editing to the workspace-facing settings page using a dedicated form.
- Keep the existing workspace update schema as the shared validation source.
- Add the deletion-job predicate directly to the organization update.
- Convert duplicate slug constraint failures into deterministic `409 Workspace slug already exists` responses.
- Audit changed field names without recording old or new values.
- After success, refresh the authenticated workspace list so the sidebar and workspace switcher show the new identity immediately.

### Acceptance criteria

- Authorized administrators can update name and slug.
- Duplicate slugs and deletion races return clear conflicts.
- Navigation state updates without requiring a reload.

## 5. Implement atomic ownership transfer

### Transfer semantics

- The actor must be an interactive owner with `workspace.transfer`.
- The target must be an existing member of the same workspace and must not be the actor.
- The target must not already be an owner.
- A successful transfer promotes the target to `owner` and demotes the actor to `admin` in one transactional D1 batch.
- The conditional statements must verify the actor and target roles at write time. A concurrent membership or role change causes a `409` without a partial transfer.
- Other existing owners, if any, remain owners.
- Emit one `workspace.owner.transfer` audit event containing actor and target member IDs, never user secrets.
- Refresh the auth context after success so the actor immediately receives administrator permissions.

### Acceptance criteria

- Transfer cannot leave the workspace without an owner.
- Promotion and demotion cannot commit independently.
- Stale or concurrent transfer attempts fail without partial role changes.
- Only eligible target members appear in the transfer form.

## 6. Complete deletion status and retry behavior

### Request and preflight

- Keep the existing owner-only confirmation using the exact workspace slug.
- Before showing confirmation, display blocking dependency counts for links and active domains and link to their management pages.
- Do not create a deletion job while existing service preconditions reject the workspace.
- Once the job exists, all ordinary workspace mutations remain unavailable.

### Status model

Expose a workspace-facing deletion status with this UI model:

- `pending`: waiting for the storage-drain deadline.
- `purging`: storage cleanup is running.
- `blocked`: the job remains in `purging` with a recognized dependency or cleanup error code.
- `complete`: returned directly by a successful retry, or inferred by the client when subsequent polling reports that the formerly deleting workspace no longer exists.

Do not add a persistent `complete` row because workspace deletion intentionally cascades the job.

### Retry and client behavior

- Add an owner-facing `POST /api/workspaces/:id/deletion/retry` endpoint requiring an interactive owner with `workspace.delete`.
- The endpoint may call the existing idempotent deletion processor and return `pending`, `purging`, `blocked`, or `complete`.
- Poll only while the job is active and stop when the page is paused or unmounted.
- On `complete`, or when polling receives the documented post-deletion missing-workspace response, refresh auth state and navigate to another workspace or the workspace selector.
- Display recognized error codes without exposing raw exception messages.

### Acceptance criteria

- Owners can observe, retry, and recover an interrupted deletion.
- The UI represents pending, purging, blocked, and complete outcomes consistently.
- Completed deletion removes stale workspace and permission state from the client.

## 7. Restructure the settings UI

Organize `app/pages/dashboard/settings/workspace.vue` into app-owned cards or sections:

- General: workspace name and slug.
- Link defaults: default slug length, redirect status, and case sensitivity.
- Webhooks: endpoint, configured state, rotate, remove, and one-time secret display.
- Danger zone: ownership transfer and workspace deletion.

Implementation requirements:

- Put every form in a dedicated `*Form.vue` component.
- Put ownership transfer, secret removal, and deletion confirmation in dedicated `*Dialog.vue` components using `AlertDialog` for confirmations and `ResponsiveModal` for task content.
- Do not modify `app/components/ui/**`.
- Use existing component variants and semantic design tokens.
- Provide field validation, actionable server errors, pending state, duplicate-submission protection, dirty-state tracking, and success feedback.
- Preserve entered values after failed requests.
- Hide owner-only actions from non-owners and disable ordinary settings controls when the user lacks `workspace.settings`.
- Explain the effect of case sensitivity, redirect status, ownership transfer, and permanent deletion before submission.
- Keep the layout usable at narrow and wide viewport sizes.

### Localization

- Add messages to the workspace product-domain locale module.
- Keep every locale directory aligned on files, keys, and interpolation placeholders.
- Update all locales and application references in the same change.

## 8. Regression coverage

Add API or service tests for:

- The authorization matrix for session users, Access users, API keys, and Access service identities.
- Owner, administrator, member, and viewer permissions.
- Atomic settings/deletion races.
- Atomic link-write/case-transition races.
- Allowed and rejected case-sensitivity transitions.
- Create, edit, upsert, import, D1 read, KV read, and redirect case behavior.
- Webhook URL validation at save and delivery time.
- Secret preservation, one-time rotation response, removal, authorization, and redaction.
- Workspace name/slug updates, duplicate slug handling, deletion guards, and auth-state refresh inputs.
- Ownership transfer success, stale requests, concurrent transfers, invalid targets, and audit behavior.
- Deletion preflight, status mapping, owner retry, idempotency, and post-completion handling.
- Audit action names, changed-field metadata, and sensitive-data redaction.

Add component or composable tests for form dirty state, pending state, error preservation, permission visibility, one-time secret display, and deletion polling teardown where practical.

## 9. Verification and release gate

Before considering implementation complete, run:

```bash
pnpm lint
pnpm types:check
pnpm build
pnpm test --run
```

Also verify that generated migrations are committed if the schema changes and that `git diff --check` passes.

Deployment is a separate production-mutating step. Do not apply remote migrations or deploy without an explicit release request after implementation verification.

After an authorized deployment:

- Smoke-test settings reads and writes with an authorized interactive user.
- Confirm unauthorized roles and identities cannot mutate settings or secrets.
- Confirm webhook secrets are absent from ordinary responses and audit records.
- Confirm unsafe webhook URLs are rejected.
- Confirm settings and link writes conflict after deletion begins.
- Confirm link creation and redirect behavior match case and redirect defaults.
- Confirm ownership transfer refreshes the actor's effective permissions.
- Confirm deletion polling exits and refreshes workspace state after completion.

## Recommended delivery order

1. Authorization and response contracts.
2. Atomic deletion guards across all workspace writes.
3. Case-sensitivity database invariants.
4. Webhook URL validation and secret lifecycle.
5. Workspace identity and ownership transfer.
6. Deletion status and owner retry.
7. Sectioned UI and locale updates.
8. Full regression suite and local verification.
9. Separately authorized deployment and production smoke tests.
