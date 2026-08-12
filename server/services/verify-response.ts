import type { H3Event } from 'h3'
import type { VerifyResponse } from '#shared/types/auth'
import { asc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isRole } from '#shared/auth/permissions'
import { isCloudflareAccessConfigured } from '#shared/utils/cloudflare-access'
import { members, organizations } from '../database/schema'

export async function buildVerifyResponse(event: H3Event): Promise<VerifyResponse> {
  const auth = requireAuth(event)
  const workspaces = auth.user
    ? await drizzle(event.context.cloudflare.env.DB)
        .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role })
        .from(members)
        .innerJoin(organizations, eq(members.organizationId, organizations.id))
        .where(eq(members.userId, auth.user.id))
        .orderBy(asc(members.createdAt), asc(organizations.id))
    : []
  return {
    name: 'Set',
    url: 'https://sink.cool',
    auth,
    workspaces: workspaces.filter(
      (workspace): workspace is typeof workspace & { role: NonNullable<typeof auth.role> } => isRole(workspace.role),
    ),
    accessEnabled: isCloudflareAccessConfigured(useRuntimeConfig(event).cfAccessTeamDomain, useRuntimeConfig(event).cfAccessAud),
  }
}
