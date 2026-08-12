import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { isRole } from '#shared/auth/permissions'
import { members, organizations } from '../database/schema'

defineRouteMeta({
  openAPI: {
    description: 'Return the authenticated user and workspace access',
  },
})

export default eventHandler(async (event) => {
  const auth = requireAuth(event)
  const workspaces = auth.user
    ? await drizzle(event.context.cloudflare.env.DB)
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          role: members.role,
        })
        .from(members)
        .innerJoin(organizations, eq(members.organizationId, organizations.id))
        .where(eq(members.userId, auth.user.id))
    : []

  return {
    name: 'Sink',
    url: 'https://sink.cool',
    auth,
    workspaces: workspaces.filter(
      (workspace): workspace is typeof workspace & { role: NonNullable<typeof auth.role> } => isRole(workspace.role),
    ),
    accessEnabled: isCloudflareAccessConfigured(
      useRuntimeConfig(event).cfAccessTeamDomain,
      useRuntimeConfig(event).cfAccessAud,
    ),
  }
})
