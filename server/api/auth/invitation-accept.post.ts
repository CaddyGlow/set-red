import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { invitations, workspaceDeletionJobs } from '../../database/schema'

const InvitationAcceptSchema = z.object({
  invitationId: z.string().trim().min(1).max(256),
}).strict()

function isDeletionConflict(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('workspace deletion is in progress')
}

export default eventHandler(async (event) => {
  const input = await readValidatedBody(event, InvitationAcceptSchema.parse)
  const headers = new Headers(getHeaders(event) as HeadersInit)
  const auth = useBetterAuth(event)
  const session = await auth.api.getSession({ headers })
  if (!session)
    throw createError({ status: 401, statusText: 'Unauthorized' })

  const db = drizzle(event.context.cloudflare.env.DB)
  const [invitation] = await db.select({ id: invitations.id }).from(invitations).where(and(
    eq(invitations.id, input.invitationId),
    eq(invitations.status, 'pending'),
  )).limit(1)
  if (!invitation)
    throw createError({ status: 404, statusText: 'Invitation not found' })

  const [deletion] = await db.select({ workspaceId: workspaceDeletionJobs.workspaceId })
    .from(workspaceDeletionJobs)
    .innerJoin(invitations, eq(invitations.organizationId, workspaceDeletionJobs.workspaceId))
    .where(eq(invitations.id, input.invitationId))
    .limit(1)
  if (deletion)
    throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })

  try {
    return await auth.api.acceptInvitation({ headers, body: input })
  }
  catch (error) {
    if (isDeletionConflict(error))
      throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
    throw error
  }
})
