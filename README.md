# Set

**A Simple / Speedy / Secure Link Shortener with Analytics, 100% run on Cloudflare.**

[Website](https://app.set.red) · [Documentation](https://docs.set.red) · [API Reference](https://app.set.red/_docs/scalar)

![Cloudflare](https://img.shields.io/badge/Cloudflare-F69652?style=flat&logo=cloudflare&logoColor=white)
![Nuxt](https://img.shields.io/badge/Nuxt-00DC82?style=flat&logo=nuxtdotjs&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?style=flat&logo=shadcnui&logoColor=white)

![Set](./public/banner.png)

Set is a fork of [Sink](https://github.com/ccbikai/Sink) by ccbikai, renamed and extended with
multi-tenant workspaces, email and Cloudflare Access authentication, and a reworked interface.
Upstream fixes can still be pulled from the parent repository.

---

## ✨ Features

- **🔗 URL Shortening:** Compress your URLs to their minimal length.
- **📈 Analytics:** Monitor link analytics and gather insightful statistics.
- **☁️ Serverless:** Deploy without the need for traditional servers.
- **🎨 Customizable Slug:** Support personalized slugs, UTM parameters, and optional case-sensitive slug matching through configuration.
- **🪄 AI Assistance:** Optionally use Cloudflare Workers AI to generate slugs and OpenGraph metadata from page content.
- **⏰ Link Control:** Set expirations, passwords, and unsafe-link warning pages.
- **📱 Smart Routing:** Redirect visitors by device or country.
- **🖼️ Social Preview:** Customize social previews with titles, descriptions, and images.
- **📊 Near-real-time Analytics:** Display a live 3D globe and event logs using 10-second analytics polling and client-side replay, not SSE or WebSocket.
- **🔲 QR Code:** Generate QR codes for your short links.
- **📦 Import/Export:** Transfer links via JSON and export access analytics via CSV.
- **🌍 Multi-language:** Full i18n support for dashboard and redirect pages.

## 🔐 Authentication

Set supports three ways in, and they can run side by side:

- **Email and password**, with registration gated by `NUXT_AUTH_PUBLIC_SIGNUP_ENABLED`.
- **Cloudflare Access**, enforced at the edge in front of `/dashboard`. Configure
  `NUXT_CF_ACCESS_TEAM_DOMAIN` and `NUXT_CF_ACCESS_AUD`, and the login page offers
  "Continue with Cloudflare Access".
- **API keys** for programmatic use, scoped per workspace.

## 🧱 Technologies Used

- **Framework**: [Nuxt 4](https://nuxt.com/)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) is the authoritative link store; [Workers KV](https://developers.cloudflare.com/kv/) is a write-through read cache
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Analytics Engine**: [Cloudflare Workers Analytics Engine](https://developers.cloudflare.com/analytics/)
- **Object Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) for optional logical JSON snapshots
- **AI**: Optional [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- **UI Components**: [shadcn-vue](https://www.shadcn-vue.com/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Deployment**: [Cloudflare](https://www.cloudflare.com/)

## 🏗️ Deployment

Deploy to [Cloudflare Workers](https://docs.set.red/deployment/workers) (recommended) or
[Cloudflare Pages](https://docs.set.red/deployment/pages) (deprecated).

```bash
pnpm install
pnpm build
pnpm deploy:worker    # applies remote D1 migrations, then publishes
```

Local development:

```bash
pnpm dev                  # http://localhost:7465
pnpm db:migrate:local     # apply migrations to the local D1
pnpm test --run           # full test suite
```

## ⚒️ Configuration

[Configuration Docs](https://docs.set.red/configuration/) · start from `.env.example`.

## 🔌 API

[API Docs](https://docs.set.red/api/) · Scalar reference is served at `/_docs/scalar` on your instance.

## 🤖 AI Skills

Install the Set AI skill for enhanced coding assistance:

```bash
npx skills add CaddyGlow/set-red
```

## 🧰 MCP

There is no native MCP server, but the OpenAPI document can be proxied:

> Replace the domain in `OPENAPI_SPEC_URL` and the `API_KEY` with your own instance configuration.
> The `API_KEY` is the same as the `NUXT_SITE_TOKEN` in your instance's environment variables.

```json
{
  "mcpServers": {
    "set": {
      "command": "uvx",
      "args": [
        "mcp-openapi-proxy"
      ],
      "env": {
        "OPENAPI_SPEC_URL": "https://app.set.red/_docs/openapi.json",
        "API_KEY": "YOUR_SITE_TOKEN",
        "TOOL_WHITELIST": "/api/link"
      }
    }
  }
}
```

## 🙋🏻 FAQs

[FAQs](https://docs.set.red/faqs)

## 💖 Credits

1. [**Sink**](https://github.com/ccbikai/Sink) by ccbikai, the upstream project
2. [**Cloudflare**](https://www.cloudflare.com/)
3. [**NuxtHub**](https://hub.nuxt.com/)
4. [**Astroship**](https://astroship.web3templates.com/)
5. [**Tailark**](https://tailark.com/)

## 📄 License

See [LICENSE](./LICENSE).
