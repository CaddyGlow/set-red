import { defineConfig } from 'vitepress'

const siteUrl = 'https://docs.set.red'
const socialLinks = [
  { icon: 'github' as const, link: 'https://github.com/CaddyGlow/set-red', ariaLabel: 'Set on GitHub' },
]

function routeFromRelativePath(relativePath: string): string {
  const isIndex = /(?:^|\/)index\.md$/.test(relativePath)
  const route = relativePath
    .replace(/(^|\/)index\.md$/, '$1')
    .replace(/\.md$/, '')
    .replace(/\/$/, '')
  const pathname = `/${route}`.replace(/\/+/g, '/')
  return isIndex && pathname !== '/' ? `${pathname}/` : pathname
}

export default defineConfig({
  title: 'Set Documentation',
  description: 'A Simple / Speedy / Secure Link Shortener with Analytics, 100% run on Cloudflare.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: siteUrl,
  },
  head: [
    ['link', { rel: 'icon', href: 'https://app.set.red/favicon.ico', sizes: 'any' }],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Deployment', link: '/deployment/workers' },
      { text: 'Features', link: '/features/links' },
      { text: 'Operations', link: '/features/import-export' },
      { text: 'Integrations', link: '/integrations/' },
      { text: 'API', link: '/api/' },
      { text: 'Website', link: 'https://app.set.red' },
    ],
    sidebar: {
      '/': [
        { text: 'Introduction', link: '/' },
        { text: 'Guide', items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Architecture', link: '/guide/architecture' },
        ] },
        { text: 'Deployment', items: [
          { text: 'Cloudflare Workers', link: '/deployment/workers' },
          { text: 'Continuous Deployment', link: '/deployment/continuous-deployment' },
          { text: 'Cloudflare Pages', link: '/deployment/pages' },
          { text: 'Upgrading Set', link: '/deployment/upgrading' },
        ] },
        { text: 'Configuration', items: [
          { text: 'Environment Variables', link: '/configuration/' },
          { text: 'Authentication', link: '/configuration/authentication' },
          { text: 'Cloudflare Access', link: '/configuration/cloudflare-access' },
          { text: 'Webhooks', link: '/configuration/webhooks' },
        ] },
        { text: 'Features', items: [
          { text: 'Dashboard', link: '/features/dashboard' },
          { text: 'Links', link: '/features/links' },
          { text: 'Analytics and Realtime', link: '/features/analytics' },
          { text: 'Workers AI', link: '/features/ai' },
        ] },
        { text: 'Operations', items: [
          { text: 'Import and Export', link: '/features/import-export' },
          { text: 'Link Backups', link: '/features/backups' },
          { text: 'Multitenant provisioning', link: '/multitenancy' },
        ] },
        { text: 'Integrations', items: [
          { text: 'Integrations', link: '/integrations/' },
        ] },
        { text: 'Reference', items: [
          { text: 'API', link: '/api/' },
          { text: 'Troubleshooting', link: '/faqs' },
        ] },
      ],
    },
    editLink: {
      pattern: 'https://github.com/CaddyGlow/set-red/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
    socialLinks,
    search: {
      provider: 'local',
    },
  },
  transformPageData(pageData) {
    const currentPath = routeFromRelativePath(pageData.relativePath)
    const canonical = `${siteUrl}${currentPath}`
    const pageTitle = pageData.frontmatter.title
    const title = pageData.frontmatter.layout === 'home'
      ? pageTitle
      : `${pageTitle} | Set Documentation`
    const description = pageData.frontmatter.description

    pageData.frontmatter.head = [
      ...(pageData.frontmatter.head ?? []),
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { name: 'description', content: description }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:image', content: 'https://app.set.red/banner.png' }],
      ['meta', { property: 'og:locale', content: 'en_US' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: 'https://app.set.red/banner.png' }],
    ]
  },
})
