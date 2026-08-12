---
title: Getting Started
description: Prepare Cloudflare resources, deploy Set, and create your first short link.
---

# Getting Started

Set is a self-hosted short-link app with visit analytics. It runs on Cloudflare (no VPS required).

## 1. Fork Set

Create a [fork of the Set repository](https://github.com/CaddyGlow/set-red/fork) in your GitHub account.

## 2. Choose where to deploy

- [Cloudflare Workers](/deployment/workers) — recommended
- [Cloudflare Pages](/deployment/pages) — deprecated

Both use Git: Cloudflare builds from your fork and publishes the app.

## 3. Create Cloudflare resources

In the [Cloudflare dashboard](https://dash.cloudflare.com/), create the services Set will use. Later you will **bind** them to the project — binding means “connect this database/storage to Set under a fixed name”.

| Binding name | Cloudflare product       | Required?   | What it is                          |
| ------------ | ------------------------ | ----------- | ----------------------------------- |
| `DB`         | **D1** (database)        | Yes         | Stores your links                   |
| `KV`         | **KV** (key-value store) | Yes         | Speeds up redirects                 |
| `ANALYTICS`  | **Analytics Engine**     | Recommended | Visit stats and logs                |
| `R2`         | **R2** (object storage)  | Optional    | Backups and social preview images   |
| `AI`         | **Workers AI**           | Optional    | AI-suggested short codes and titles |

For the full experience, create all five. You can add analytics later — see [Analytics and Realtime](/features/analytics).

After creating D1 and KV, open each resource’s detail page and copy its **ID** (you will paste it into deploy settings).

## 4. Configure and deploy

Follow the Workers or Pages guide to connect the fork, add bindings, and set variables.

::: warning Configure authentication and bootstrap
Set `NUXT_AUTH_SECRET`, `NUXT_AUTH_BASE_URL`, the app/short-link hostnames, and a short-lived bootstrap token. Follow [multitenant operations](/multitenancy) and remove the bootstrap token after the first owner is created.
:::

Other settings: [configuration reference](/configuration/).

## 5. First login and first link

1. Open `https://your-domain/dashboard`
2. Sign in with the verified email/password created by bootstrap
3. Select its workspace and create your first short link

The dashboard supports multiple languages. Docs are available in English and Simplified Chinese.
