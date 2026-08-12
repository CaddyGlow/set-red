import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { currentLocales } from './i18n/i18n'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  modules: [
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@nuxt/eslint',
    '@pinia/nuxt',
    'shadcn-nuxt',
  ],
  devtools: { enabled: true },
  css: ['@/assets/css/tailwind.css'],
  colorMode: {
    classSuffix: '',
  },
  runtimeConfig: {
    authSecret: process.env.NUXT_AUTH_SECRET || 'development-only-auth-secret-change-me',
    authBaseURL: process.env.NUXT_AUTH_BASE_URL || '',
    authTrustedOrigins: process.env.NUXT_AUTH_TRUSTED_ORIGINS || '',
    authEmailPasswordEnabled: process.env.NUXT_AUTH_EMAIL_PASSWORD_ENABLED === 'true',
    authPublicSignupEnabled: process.env.NUXT_AUTH_PUBLIC_SIGNUP_ENABLED === 'true',
    authAccessServiceIdentity: process.env.NUXT_AUTH_ACCESS_SERVICE_IDENTITY || '',
    authBootstrapToken: process.env.NUXT_AUTH_BOOTSTRAP_TOKEN || '',
    authBootstrapExpiresAt: process.env.NUXT_AUTH_BOOTSTRAP_EXPIRES_AT || '',
    appHostname: process.env.NUXT_APP_HOSTNAME || '',
    shortLinkHostnames: process.env.NUXT_SHORT_LINK_HOSTNAMES || 'set.red,brut.mov,elan.ing',
    resendApiKey: process.env.RESEND_API_KEY || '',
    authEmailFrom: process.env.AUTH_EMAIL_FROM || '',
    cfAccessTeamDomain: '',
    cfAccessAud: '',
    redirectStatusCode: '301',
    linkCacheTtl: 60,
    redirectWithQuery: false,
    redirectNoStore: false,
    homeURL: '',
    cfAccountId: '',
    cfApiToken: '',
    dataset: 'sink_multitenant',
    aiModel: '@cf/qwen/qwen3-30b-a3b-fp8',
    aiPrompt: `You are a URL shortening assistant, please shorten the URL provided by the user into a SLUG. The SLUG information should be derived from the URL and page content (if provided). Do not make any assumptions beyond the given information. A SLUG is human-readable and should not exceed three words and can be validated using regular expressions {slugRegex} . Only the best one is returned, the format must be JSON reference {"slug": "example-slug"}`,
    aiOgPrompt: `You are an OpenGraph metadata assistant. Please summarize the page content provided by the user into a perfect title and description for an OpenGraph preview. Do not make any assumptions beyond the given information. Only the best one is returned, the format must be JSON reference {"title": "Example Title", "description": "Example description that summarizes the page accurately."}`,
    caseSensitive: false,
    importRequestLimit: 100,
    listQueryLimit: 500,
    disableBotAccessLog: false,
    disableAutoBackup: false,
    notFoundRedirect: '',
    safeBrowsingDoh: '', // Set to DoH URL to enable auto-detection, e.g. https://family.cloudflare-dns.com/dns-query
    public: {
      authPublicSignupEnabled: process.env.NUXT_AUTH_PUBLIC_SIGNUP_ENABLED === 'true',
      previewMode: '',
      slugDefaultLength: '6',
      kvBatchLimit: '50',
    },
  },
  routeRules: {
    '/dashboard': {
      redirect: '/dashboard/links',
    },
    '/api/**': {
      cors: process.env.NUXT_API_CORS === 'true',
    },
    '/_docs/**': {
      headers: { 'X-Robots-Tag': 'noindex, follow' },
    },
    '/sphere.bin': {
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    },
    '/*.json': {
      headers: { 'Cache-Control': 'public, max-age=2592000, immutable' },
    },
    '/*.geojson': {
      headers: { 'Cache-Control': 'public, max-age=2592000, immutable' },
    },
  },
  experimental: {
    enforceModuleCompatibility: true,
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ['vite/client'],
      },
    },
  },
  compatibilityDate: '2026-07-13',
  nitro: {
    preset: import.meta.env.CF_PAGES !== '1' ? 'cloudflare-module' : undefined,
    experimental: {
      openAPI: true,
    },
    timing: true,
    openAPI: {
      production: 'runtime',
      meta: {
        title: 'Set API',
        description: 'A Simple / Speedy / Secure Link Shortener with Analytics, 100% run on Cloudflare.\n\n[Return to this Set instance](/) · [Read the documentation](https://docs.set.red)',
      },
      route: '/_docs/openapi.json',
      ui: {
        scalar: {
          route: '/_docs/scalar',
        },
        swagger: {
          route: '/_docs/swagger',
        },
      },
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      include: [
        '@internationalized/date',
        '@lucide/vue',
        '@number-flow/vue',
        '@tanstack/vue-form',
        '@unovis/vue',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'd3-geo',
        'd3-scale',
        'nanoid',
        'qr-code-styling', // CJS
        'reka-ui',
        'reka-ui/date',
        'tailwind-merge',
        'twgl.js',
        'vaul-vue',
        'virtua/vue',
        'vue-sonner',
        'vue3-simple-icons',
        'zod',
      ],
    },
  },
  eslint: {
    config: {
      standalone: false,
    },
  },
  i18n: {
    locales: currentLocales,
    compilation: {
      strictMessage: false,
      escapeHtml: true,
    },
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'set_i18n_redirected',
      redirectOn: 'root',
    },
    baseUrl: '/',
    defaultLocale: 'en-US',
  },
  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: './app/components/ui',
  },
})
