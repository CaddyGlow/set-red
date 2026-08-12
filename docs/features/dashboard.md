---
title: Dashboard
description: A tour of the Set dashboard — navigation, workspaces, links, analytics, and the administration areas.
---

# Dashboard

The dashboard lives at `/dashboard` and redirects to `/dashboard/links`. It is a client-rendered
application: the marketing page and the auth pages are the only prerendered routes.

## Navigation

A collapsible sidebar holds the primary navigation, with the workspace switcher at the top and
account controls at the bottom. The switcher calls `PUT /api/workspaces/active`; the selection is
stored server-side rather than in the browser, so it survives across devices.

| Area           | Path                    | What it is                                        |
| -------------- | ----------------------- | ------------------------------------------------- |
| Links          | `/dashboard/links`      | Create, search, filter and edit short links       |
| Analytics      | `/dashboard/analysis`   | Visit reports, filters and metric breakdowns      |
| Realtime       | `/dashboard/realtime`   | 3D globe and a live-feeling event log             |
| Link check     | `/dashboard/check`      | Bulk destination health checks                    |
| Workspaces     | `/dashboard/workspaces` | Workspaces you belong to, and invitations         |
| Settings       | `/dashboard/settings`   | Workspace identity, webhooks, ownership, deletion |
| Administration | `/dashboard/admin`      | Domains, workspaces and instance administrators   |

Administration is only rendered for instance administrators. Ordinary members never see it, and
the API enforces the same boundary independently of the UI.

## Links

The links view is a virtualized list, so large workspaces stay responsive. Each link exposes:

- Inline editing of destination, slug, comment, tags and UTM parameters
- Expiration, password protection and unsafe-link warning pages
- Device and country routing rules
- Social preview title, description and image
- A QR code dialog that renders and downloads the code
- Per-link analytics, filtered to that slug

Search opens as a dialog with keyboard navigation. Filters and sorting are reflected in the URL,
so a filtered view can be shared or bookmarked.

## Analytics

Analytics reads from Cloudflare Analytics Engine. The view combines a visit chart, counters, and
metric groups — referrer, country, city, device, browser, OS and language — each of which opens a
detail dialog. A date-range picker with custom ranges scopes everything on the page, and access
events can be exported as CSV.

Without the `ANALYTICS` binding, redirects still work; this view simply has nothing to show.

## Realtime

The realtime page is intentionally **pseudo-live**: it polls analytics every 10 seconds, then
replays newly discovered events through a bounded client-side queue at roughly one per second, so
the globe animates smoothly instead of jumping. Pausing stops polling, queue replay and the WebGL
motion. It is not an SSE or WebSocket stream, and it is not a real-time guarantee.

## Workspaces

Every link, domain and API key belongs to a workspace. Members hold one of four roles — owner,
admin, member, viewer — and permissions derive from that role everywhere, including for Cloudflare
Access identities. Invitations are emailed and accepted through a tokenized link; an invited person
without an account registers first and then accepts.

Workspace settings cover identity (name, slug), redirect behaviour, webhook delivery with a
rotatable signing secret, ownership transfer, and deletion.

## Administration

Instance administrators manage short-link domains — assigning a hostname to a workspace, marking a
primary domain, setting per-domain not-found redirects and home URLs — plus the workspace list and
the set of instance administrators. Domain resolution is scoped by exact host at request time, so a
hostname that is not assigned to an active domain will not resolve links.

## Migration

Instances upgraded from a KV-only version get a migration screen that moves links into D1 and
records a completed migration run. Until that run is recorded, KV remains the source for
pre-existing links; D1 is authoritative afterwards.
