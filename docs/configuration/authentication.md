---
title: Authentication
description: How people and machines sign in to Set — email and password, Cloudflare Access, site token and API keys.
---

# Authentication

Set separates two things: **short links are always public**, and everything under `/dashboard` and
`/api/**` requires an identity. There are four ways to present one, and they can run side by side.

| Method             | Who uses it           | Where it is configured                                |
| ------------------ | --------------------- | ----------------------------------------------------- |
| Email and password | People                | `NUXT_AUTH_SECRET`, plus an email provider for resets |
| Cloudflare Access  | People, via your IdP  | `NUXT_CF_ACCESS_TEAM_DOMAIN`, `NUXT_CF_ACCESS_AUD`    |
| Site token         | Scripts, integrations | `NUXT_SITE_TOKEN`                                     |
| Workspace API keys | Scoped automation     | Created in the dashboard, scoped to one workspace     |

## Email and password

The login page at `/login` posts to Better Auth. Passwords must be at least 12 characters at
registration. Password resets are emailed, so `RESEND_API_KEY` and `AUTH_EMAIL_FROM` must be set
for the reset link to arrive.

Registration is closed by default. Set `NUXT_AUTH_PUBLIC_SIGNUP_ENABLED=true` to open `/register`;
while it is false, the route returns 404 and the signup calls to action are hidden. Closed signup
is the right default for a private instance — invite people to a workspace instead, which lets
them register through the invitation link.

## Cloudflare Access

Cloudflare Access authenticates **at the edge**, in front of the application. Set never sees a
password: it verifies the signed Access JWT (issuer, audience, signature and expiry) that arrives
as the `Cf-Access-Jwt-Assertion` header or the `CF_Authorization` cookie.

Because the challenge happens at the edge, the sign-in flow is a plain navigation:

1. Someone opens `/dashboard`, which your Access application covers.
2. Cloudflare shows your identity provider's login.
3. On success the request reaches Set with a verified JWT, and the session is established.

When `NUXT_CF_ACCESS_TEAM_DOMAIN` and `NUXT_CF_ACCESS_AUD` are both set, the login page also shows
a **Continue with Cloudflare Access** button, which performs a full page navigation to
`/dashboard` so that the edge challenge can fire. A client-side route change would never reach
Cloudflare, so the button deliberately leaves the SPA router.

That button's visibility is decided at **build time**, since the SPA client cannot read
server-side environment variables. If Access is configured on the worker but the button is
missing, the build did not have those two variables — see
[Continuous Deployment](/deployment/continuous-deployment).

Full setup, including how identities map to workspace roles and how service tokens are treated,
is in [Cloudflare Access](/configuration/cloudflare-access).

## Site token and API keys

`NUXT_SITE_TOKEN` is an instance-wide bearer token for `/api/**`. Workspace API keys are narrower:
they are created in the dashboard, scoped to a single workspace, and carry the permissions of the
member who created them. Prefer API keys for anything long-lived, and treat the site token as an
administrative credential.

```bash
curl https://your-host/api/link/list \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

## Reserved routes

Short links resolve on the same hostnames as the application, so the router reserves the paths the
app itself owns. `dashboard`, `login`, `register`, `forgot-password` and `reset-password` cannot be
claimed as slugs, and requests to them are never treated as redirects. The list lives in
`reserveSlug` in `app/app.config.ts`; extend it if you add top-level routes.

## Signing out

Signing out clears the Set session. If the session came from Cloudflare Access, the dashboard also
sends you to `/cdn-cgi/access/logout`, otherwise the edge would sign you straight back in.
