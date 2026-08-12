---
title: Continuous Deployment
description: Deploy the Set worker and documentation site from GitHub Actions on every push to master.
---

# Continuous Deployment

The repository ships two workflows:

| Workflow                       | Trigger                              | What it does                                                            |
| ------------------------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | Every push and pull request          | Lint, locale contract check, typecheck, build, full test suite          |
| `.github/workflows/deploy.yml` | Push to `master`, or manual dispatch | Runs `ci.yml` first, then deploys the worker and the documentation site |

`deploy.yml` calls `ci.yml` as a reusable workflow, so a failing test blocks the deploy. Both
workflows can also be started by hand from the **Actions** tab.

This is an alternative to Cloudflare's own Git integration ([Workers Builds](/deployment/workers)).
Use one or the other, not both, or two deploys will race for the same worker.

## What the deploy job does

1. Installs dependencies with a frozen lockfile.
2. Builds the Nuxt app. Flags that the client reads — Cloudflare Access availability and public
   signup — are resolved **at build time**, because an SPA client cannot read server-side
   environment variables. They must be present in this step or the related UI silently disappears.
3. Runs `pnpm deploy:worker`, which regenerates `wrangler.deploy.jsonc` from `wrangler.jsonc` plus
   the `DEPLOY_*` variables, applies pending D1 migrations to the remote database, and publishes.
4. In a parallel job, builds the VitePress site and deploys it as a separate worker.

`wrangler.deploy.jsonc` is generated, never committed: it is in `.gitignore` precisely so that
resource IDs stay out of the repository.

## Required secrets

Set these under **Settings → Secrets and variables → Actions → Secrets**:

| Secret                       | Where to find it                                                             |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`       | Cloudflare dashboard → My Profile → API Tokens → **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID`      | Cloudflare dashboard → Workers & Pages → Account ID                          |
| `DEPLOY_D1_DATABASE_ID`      | D1 database detail page                                                      |
| `DEPLOY_KV_NAMESPACE_ID`     | KV namespace detail page                                                     |
| `NUXT_CF_ACCESS_TEAM_DOMAIN` | Your Zero Trust team domain, if you use Cloudflare Access                    |
| `NUXT_CF_ACCESS_AUD`         | The Access application audience tag, if you use Cloudflare Access            |

The API token needs permission to edit Workers, D1 and KV on the account.

## Required variables

Set these under the **Variables** tab of the same page. They are not secret, but the deploy uses
them to target the right resources:

| Variable                          | Example           | Meaning                                                 |
| --------------------------------- | ----------------- | ------------------------------------------------------- |
| `DEPLOY_D1_DATABASE_NAME`         | `set-multitenant` | D1 database name shown in the binding                   |
| `DEPLOY_ANALYTICS_DATASET`        | `set_multitenant` | Analytics Engine dataset                                |
| `DEPLOY_R2_BUCKET_NAME`           | `set`             | R2 bucket; leave unset to deploy without the R2 binding |
| `NUXT_AUTH_PUBLIC_SIGNUP_ENABLED` | `false`           | Whether `/register` is reachable                        |

Runtime configuration — site token, auth secret, email provider, Access values used by the server
— stays in Worker secrets, set with `wrangler secret put` or in the Cloudflare dashboard. The
workflow never uploads them.

## Setting them from the CLI

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set DEPLOY_D1_DATABASE_ID
gh secret set DEPLOY_KV_NAMESPACE_ID
gh secret set NUXT_CF_ACCESS_TEAM_DOMAIN
gh secret set NUXT_CF_ACCESS_AUD

gh variable set DEPLOY_D1_DATABASE_NAME --body 'set-multitenant'
gh variable set DEPLOY_ANALYTICS_DATASET --body 'set_multitenant'
gh variable set DEPLOY_R2_BUCKET_NAME --body 'set'
gh variable set NUXT_AUTH_PUBLIC_SIGNUP_ENABLED --body 'false'
```

Each `gh secret set` prompts for the value on stdin, so nothing lands in your shell history.

## The production environment

Both deploy jobs declare `environment: production`. Adding required reviewers to that environment
in **Settings → Environments** turns every push to `master` into a deploy that waits for approval.

## Deploying by hand

The workflows do not replace local deploys. From a clean checkout:

```bash
pnpm install
pnpm build
pnpm deploy:worker
```

Both paths run the same migration step, so they are safe to mix.
