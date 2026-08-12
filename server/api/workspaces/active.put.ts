import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { isRole, permissionsForRole } from '#shared/auth/permissions'
import { members } from '../../database/schema'
import { setAccessActiveWorkspace } from '../../services/access-workspace'
import { buildVerifyResponse } from '../../services/verify-response'

const ActiveWorkspaceSchema = z.object({ workspaceId: z.string().trim().min(1).max(256) }).strict()

export default eventHandler(async (event) => {
  const auth = requireInteractiveUser(event)
  const { workspaceId } = await readValidatedBody(event, ActiveWorkspaceSchema.parse)
  const selected = auth.method === 'session' ? null : await setAccessActiveWorkspace(event, auth.user.id, workspaceId)
  if (auth.method === 'session') {
    await useBetterAuth(event).api.setActiveOrganization({
      headers: new Headers(getHeaders(event) as HeadersInit),
      body: { organizationId: workspaceId },
    })
  }
  const membership = selected ?? (await drizzle(event.context.cloudflare.env.DB).select({ role: members.role }).from(members).where(and(
    eq(members.userId, auth.user.id),
    eq(members.organizationId, workspaceId),
  )).limit(1))[0]
  if (!membership || !isRole(membership.role))
    throw createError({ status: 403, statusText: 'Workspace membership required' })
  auth.workspaceId = workspaceId
  auth.role = membership.role
  auth.permissions = permissionsForRole(membership.role)
  return await buildVerifyResponse(event)
})
