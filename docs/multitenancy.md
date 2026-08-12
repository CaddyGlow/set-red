# Multitenant fork operations

This fork is greenfield-only. Provision a new D1 database, KV namespace, `sink_multitenant`
Analytics Engine dataset, and R2 bucket before deployment. Never reuse bindings from a
single-tenant Sink installation. Apply the single migration in `drizzle/`, deploy the configured
app and short-link hostnames, and then invoke `POST /api/bootstrap` once with the expiring
`x-bootstrap-token` configured by `NUXT_AUTH_BOOTSTRAP_TOKEN` and
`NUXT_AUTH_BOOTSTRAP_EXPIRES_AT`. Remove both bootstrap variables after success.

The bootstrap body supplies the first verified owner, workspace name and slug, and the primary
hostname. The hostname must occur in `NUXT_SHORT_LINK_HOSTNAMES`; `NUXT_APP_HOSTNAME` must be a
different host. Bootstrap creates rows for every configured short-link hostname and refuses to
run when an instance administrator already exists.

Domains remain operator-provisioned. Add a `custom_domain` route to `wrangler.jsonc` and deploy
before assigning the matching canonical hostname through an instance-administrator operation.
Workspace owners and admins may change a domain's primary status, home URL, not-found redirect,
and active status. A domain with links cannot be reassigned.

## Authentication measurements

Measured locally on Node.js 22 with Better Auth 1.6.27's default scrypt implementation on
2026-08-12: three password hashes took 69.4 ms, 64.3 ms, and 61.3 ms; the corresponding verifies
took 61.7 ms, 63.8 ms, and 62.3 ms. The production Nitro server bundle after adding Better Auth
was 1,687,845 bytes uncompressed (`index.mjs` plus the main Nitro chunk). Re-run these
measurements on the selected Cloudflare paid plan before changing password parameters.

Browser authentication uses secure Better Auth session cookies. Workspace API keys are hashed,
shown once on creation, bound to one workspace, and sent as bearer credentials. There is no
shared site token and browser credentials are not stored in local storage.
