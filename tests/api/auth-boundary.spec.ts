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

  it('normalizes the pathname before blocking direct mutations', async () => {
    const response = await request('/api/auth/organization/update-member-role?source=direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(403)
  })

  it('keeps public signup disabled while exposing invitation enrollment', async () => {
    const directSignup = await request('/api/auth/sign-up/email?source=direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Public User', email: 'public@example.com', password: 'correct-horse-battery-staple' }),
    })
    expect(directSignup.status).toBe(403)

    const invitationSignup = await request('/api/auth/invitation-sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId: crypto.randomUUID(), name: 'Invited User', password: 'correct-horse-battery-staple' }),
    })
    expect(invitationSignup.status).toBe(404)
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
