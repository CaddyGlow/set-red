---
title: REST API
description: OpenAPI docs, authentication, CORS, and endpoint index for Sink.
---

# REST API

## Interactive docs

Every Sink instance publishes API docs at:

- `https://your-domain/_docs/openapi.json` — machine-readable OpenAPI
- `https://your-domain/_docs/scalar` — friendly UI
- `https://your-domain/_docs/swagger` — classic Swagger UI

Use your own domain. Public demo: [https://sink.cool/_docs/scalar](https://sink.cool/_docs/scalar).

## Authentication

Use a workspace API key for scripts:

```http
Authorization: Bearer YOUR_WORKSPACE_API_KEY
```

Keys are hashed, permission-scoped, revocable, and bound to one workspace. Browser requests use Better Auth session cookies. A conflicting `x-workspace-id` is rejected.

## CORS

Optional. Set `NUXT_API_CORS=true` at build time to allow browser apps on other sites to call `/api/**`. Login is still required. See [configuration](/configuration/#optional).

## Before you call link APIs

Provision the greenfield resources and complete the one-time bootstrap described in [multitenant operations](/multitenancy). Link create/import requests include a domain ID and authenticated CRUD uses the globally unique link ID.

- `upsert` creates when free; if the short code exists, returns it with `status: "existing"` (does **not** overwrite)
- `search` matches short code, URL, comment, and tags
- `check` probes target URLs from the server
- `verify` checks how you are authenticated
- `location` returns approximate coordinates when Cloudflare provides them
- Image upload needs R2 (JPEG/PNG/WebP/GIF, max 5 MB)

## Endpoint groups

Use the OpenAPI UI for full request/response details.

| Group          | Routes                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Links          | `/api/link/create`, `edit`, `upsert`, `delete`, `query`, `search`, `list`, `check`, `tags`                            |
| Import/export  | `/api/link/import`, `/api/link/export` — [Import and Export](/features/import-export)                                 |
| Workspaces     | `/api/workspaces/**`, `/api/domains/**`, `/api/workspaces/api-keys/**`                                                |
| AI             | `/api/link/ai`, `/api/link/og-ai` — [Workers AI](/features/ai)                                                        |
| Analytics      | `/api/stats/**`, `/api/logs/**` — [Analytics](/features/analytics)                                                    |
| Utilities      | `/api/verify`, `/api/location`, `/api/upload/image`, `/api/backup`                                                    |
| Platform admin | `/api/admin/overview`, `/api/admin/users/**`, `/api/admin/workspaces/**`, `/api/admin/domains/**`, `/api/admin/audit` |

Browser workspace switching uses `PUT /api/workspaces/active` and returns the refreshed verify
response atomically. Platform-admin routes require an instance-admin session, Access user, or the
explicitly configured Access service identity; workspace API keys are always rejected.
