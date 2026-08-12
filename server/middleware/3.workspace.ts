import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isRole, permissionsForRole } from '#shared/auth/permissions'
import { WorkspaceSettingsSchema } from '#shared/schemas/workspace'
import { members, workspaceDeletionJobs, workspaceSettings } from '../database/schema'

async function loadWorkspaceSettings(event: Parameters<typeof requireAuth>[0], workspaceId: string) {
  const [settings] = await drizzle(event.context.cloudflare.env.DB)
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1)
  if (!settings)
    throw createError({ status: 409, statusText: 'Workspace is not provisioned' })
  const { workspaceId: _workspaceId, ...values } = settings
  event.context.workspaceSettings = WorkspaceSettingsSchema.parse(values)
}

async function assertWorkspaceAvailable(event: Parameters<typeof requireAuth>[0], workspaceId: string) {
  const pathname = getRequestURL(event).pathname
  if (pathname.startsWith('/api/admin/') || /\/api\/workspaces\/[^/]+\/deletion$/.test(pathname))
    return
  const [job] = await drizzle(event.context.cloudflare.env.DB).select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)).limit(1)
  if (job)
    throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
}

export default eventHandler(async (event) => {
  if (!event.path.startsWith('/api/') || event.path.startsWith('/api/auth/') || event.path === '/api/bootstrap')
    return

  const auth = requireAuth(event)
  const requestedWorkspaceId = getHeader(event, 'x-workspace-id')?.trim() || null

  if (auth.method === 'api-key') {
    if (requestedWorkspaceId && requestedWorkspaceId !== auth.workspaceId)
      throw createError({ status: 403, statusText: 'API key is bound to a different workspace' })
    if (auth.workspaceId)
      await assertWorkspaceAvailable(event, auth.workspaceId)
    if (auth.workspaceId)
      await loadWorkspaceSettings(event, auth.workspaceId)
    return
  }

  const workspaceId = requestedWorkspaceId ?? auth.workspaceId
  if (!workspaceId)
    return

  if (!auth.user)
    throw createError({ status: 403, statusText: 'Forbidden' })

  const [membership] = await drizzle(event.context.cloudflare.env.DB).select().from(members).where(and(
    eq(members.organizationId, workspaceId),
    eq(members.userId, auth.user.id),
  )).limit(1)
  if (!membership || !isRole(membership.role))
    throw createError({ status: 403, statusText: 'Workspace membership required' })

  auth.workspaceId = workspaceId
  auth.role = membership.role
  auth.permissions = permissionsForRole(membership.role)
  await assertWorkspaceAvailable(event, workspaceId)
  await loadWorkspaceSettings(event, workspaceId)
})
