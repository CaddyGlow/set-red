export default defineAppConfig({
  title: 'Set',
  documentation: 'https://docs.set.red',
  github: 'https://github.com/miantiao-me/sink',
  coffee: '',
  twitter: '',
  telegram: '',
  description: 'A Simple / Speedy / Secure Link Shortener with Analytics, 100% run on Cloudflare.',
  image: 'https://app.set.red/banner.png',
  previewTTL: 300, // 5 minutes
  slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i,
  // Application routes must never be resolved as short-link slugs.
  reserveSlug: [
    'dashboard',
    'login',
    'register',
    'forgot-password',
    'reset-password',
  ],
})
