import type { H3Event } from 'h3'
import type { Role } from '#shared/auth/permissions'
import { and, count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { members } from '../database/schema'

export async function assertWorkspaceTarget(event: H3Event, workspaceId: string): Promise<string> {
  if (requireWorkspace(event) !== workspaceId)
    throw createError({ status: 404, statusText: 'Workspace not found' })
  return workspaceId
}

export async function countWorkspaceOwners(event: H3Event, workspaceId: string): Promise<number> {
  const [result] = await drizzle(event.context.cloudflare.env.DB).select({ count: count() }).from(members).where(and(
    eq(members.organizationId, workspaceId),
    eq(members.role, 'owner'),
  ))
  return result?.count ?? 0
}

export function assertRoleMutation(actorRole: Role | null, currentRole: Role, nextRole?: Role): void {
  if (currentRole === 'owner' || nextRole === 'owner') {
    if (actorRole !== 'owner')
      throw createError({ status: 403, statusText: 'Only owners can manage the owner role' })
  }
}
