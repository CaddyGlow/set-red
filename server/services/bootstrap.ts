import { hashPassword } from 'better-auth/crypto'
import { createError } from 'h3'
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
  const configuredHosts = [...new Set(options.shortLinkHostnames.split(',').map(canonicalizeHostname).filter(Boolean))]
  const primaryHostname = canonicalizeHostname(input.primaryHostname)
  const appHostname = canonicalizeHostname(options.appHostname)
  if (!configuredHosts.length || !configuredHosts.includes(primaryHostname))
    throw createError({ status: 400, statusText: 'Primary hostname must be a configured short-link domain' })
  if (!appHostname || configuredHosts.includes(appHostname))
    throw createError({ status: 400, statusText: 'The app hostname must be distinct from short-link domains' })

  const userId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const claim = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const ownsClaim = 'EXISTS (SELECT 1 FROM instance_bootstrap WHERE id = 1 AND claim = ?)'
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO instance_bootstrap (id, claim, completed_at)
      SELECT 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM user WHERE is_instance_admin = 1)
      ON CONFLICT(id) DO NOTHING RETURNING claim`).bind(claim, now),
    env.DB.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, is_instance_admin)
      SELECT ?, ?, ?, 1, ?, ?, 1 WHERE ${ownsClaim}`).bind(userId, input.name, input.email.toLowerCase(), now, now, claim),
    env.DB.prepare(`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${ownsClaim}`).bind(crypto.randomUUID(), userId, 'credential', userId, await hashPassword(input.password), now, now, claim),
    env.DB.prepare(`INSERT INTO organization (id, name, slug, created_at)
      SELECT ?, ?, ?, ? WHERE ${ownsClaim}`).bind(workspaceId, input.workspaceName, input.workspaceSlug, now, claim),
    env.DB.prepare(`INSERT INTO member (id, organization_id, user_id, role, created_at)
      SELECT ?, ?, ?, ?, ? WHERE ${ownsClaim}`).bind(crypto.randomUUID(), workspaceId, userId, 'owner', now, claim),
    env.DB.prepare(`INSERT INTO workspace_settings (workspace_id)
      SELECT ? WHERE ${ownsClaim}`).bind(workspaceId, claim),
    ...configuredHosts.map(hostname => env.DB.prepare(`INSERT INTO domains (id, workspace_id, hostname, status, is_primary, created_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE ${ownsClaim}`).bind(crypto.randomUUID(), workspaceId, hostname, 'active', hostname === primaryHostname ? 1 : 0, now, claim)),
    env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, workspace_ref, actor_type, actor_id, action, target_type, target_id, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ownsClaim}`).bind(crypto.randomUUID(), workspaceId, workspaceId, 'system', 'bootstrap', 'instance.bootstrap', 'workspace', workspaceId, now, claim),
  ])
  if (!results[0]?.results.length)
    throw createError({ status: 409, statusText: 'Bootstrap has already completed' })
  return { userId, workspaceId, domains: configuredHosts, primaryHostname }
}
