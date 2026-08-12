import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { users } from '../database/schema'
import { canonicalizeHostname } from './domain'

export interface BootstrapInput {
  email: string
  password: string
  name: string
  workspaceName: string
  workspaceSlug: string
  primaryHostname: string
}

export async function bootstrapInstance(
  env: Cloudflare.Env,
  input: BootstrapInput,
  options: { appHostname: string, shortLinkHostnames: string },
) {
  const [existingAdmin] = await drizzle(env.DB).select({ id: users.id }).from(users).where(eq(users.isInstanceAdmin, true)).limit(1)
  if (existingAdmin)
    throw createError({ status: 409, statusText: 'Bootstrap has already completed' })

  const configuredHosts = [...new Set(options.shortLinkHostnames.split(',').map(canonicalizeHostname).filter(Boolean))]
  const primaryHostname = canonicalizeHostname(input.primaryHostname)
  const appHostname = canonicalizeHostname(options.appHostname)
  if (!configuredHosts.length || !configuredHosts.includes(primaryHostname))
    throw createError({ status: 400, statusText: 'Primary hostname must be a configured short-link domain' })
  if (!appHostname || configuredHosts.includes(appHostname))
    throw createError({ status: 400, statusText: 'The app hostname must be distinct from short-link domains' })

  const userId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO user (id, name, email, email_verified, created_at, updated_at, is_instance_admin) VALUES (?, ?, ?, 1, ?, ?, 1)').bind(userId, input.name, input.email.toLowerCase(), now, now),
    env.DB.prepare('INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, 'credential', userId, await hashPassword(input.password), now, now),
    env.DB.prepare('INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)').bind(workspaceId, input.workspaceName, input.workspaceSlug, now),
    env.DB.prepare('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), workspaceId, userId, 'owner', now),
    env.DB.prepare('INSERT INTO workspace_settings (workspace_id) VALUES (?)').bind(workspaceId),
    ...configuredHosts.map(hostname => env.DB.prepare('INSERT INTO domains (id, workspace_id, hostname, status, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), workspaceId, hostname, 'active', hostname === primaryHostname ? 1 : 0, now)),
    env.DB.prepare('INSERT INTO audit_logs (id, workspace_id, actor_type, actor_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), workspaceId, 'system', 'bootstrap', 'instance.bootstrap', 'workspace', workspaceId, now),
  ])
  return { userId, workspaceId, domains: configuredHosts, primaryHostname }
}
