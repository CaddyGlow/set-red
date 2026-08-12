import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

function request(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`http://localhost${path}`, init))
}

describe('authentication boundary', { concurrent: false }, () => {
  it('allows unauthenticated requests to reach Better Auth', async () => {
    const session = await request('/api/auth/get-session')
    expect(session.status).toBe(200)
    expect(await session.json()).toBeNull()

    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/callback/cloudflare-access',
      '/api/auth/verify-email',
      '/api/auth/reset-password',
      '/api/auth/organization/get-invitation',
    ])
      expect((await request(path, { method: 'OPTIONS' })).status).not.toBe(401)
  })

  it('keeps application APIs protected', async () => {
    expect((await request('/api/workspaces')).status).toBe(401)
    expect((await request('/api/link/list')).status).toBe(401)
  })

  for (const path of [
    '/api/auth/organization/create',
    '/api/auth/organization/update',
    '/api/auth/organization/delete',
    '/api/auth/organization/invite-member',
    '/api/auth/organization/remove-member',
    '/api/auth/organization/update-member-role',
    '/api/auth/api-key/create',
    '/api/auth/api-key/update',
    '/api/auth/api-key/delete',
  ]) {
    it(`blocks direct mutation ${path}`, async () => {
      const response = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(response.status).toBe(403)
    })
  }
})
