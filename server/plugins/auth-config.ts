export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const config = useRuntimeConfig(event)
    if (config.authEmailPasswordEnabled && (!config.resendApiKey || !config.authEmailFrom)) {
      throw createError({
        status: 503,
        statusText: 'Email/password authentication requires RESEND_API_KEY and AUTH_EMAIL_FROM',
      })
    }
    if (config.authPublicSignupEnabled && !config.authEmailPasswordEnabled) {
      throw createError({
        status: 503,
        statusText: 'Public signup requires email/password authentication',
      })
    }
  })
})
