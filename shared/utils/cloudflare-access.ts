/**
 * Cloudflare Access is considered configured once both the team domain and the
 * application audience are known. Kept in `shared/` because the Nuxt config and
 * the server runtime both derive flags from it.
 */
export function isCloudflareAccessConfigured(teamDomain: string, audience: string): boolean {
  return !!teamDomain.trim() && !!audience.trim()
}
