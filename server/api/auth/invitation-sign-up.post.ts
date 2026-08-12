import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { InvitationRegistrationSchema } from '#shared/schemas/workspace'
import { auditLogs, invitations } from '../../database/schema'

export default eventHandler(async (event) => {
  const input = await readValidatedBody(event, InvitationRegistrationSchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const [invitation] = await db.select().from(invitations).where(and(
    eq(invitations.id, input.invitationId),
    eq(invitations.status, 'pending'),
  )).limit(1)
  if (!invitation || invitation.expiresAt.getTime() <= Date.now())
    throw createError({ status: 404, statusText: 'Invitation not found or expired' })

  const result = await useBetterAuth(event).api.signUpEmail({
    headers: new Headers(getHeaders(event) as HeadersInit),
    body: {
      email: invitation.email.toLowerCase(),
      name: input.name,
      password: input.password,
      callbackURL: `/invite/${encodeURIComponent(invitation.id)}`,
    },
  })
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    workspaceId: invitation.organizationId,
    workspaceRef: invitation.organizationId,
    actorType: 'user',
    actorId: result.user.id,
    action: 'invitation.register',
    targetType: 'invitation',
    targetId: invitation.id,
    metadata: { email: invitation.email },
    createdAt: Math.floor(Date.now() / 1000),
  })
  setResponseStatus(event, 201)
  return { user: result.user }
})
