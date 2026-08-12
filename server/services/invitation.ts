import type { H3Event } from 'h3'
import type { Role } from '#shared/auth/permissions'
import { and, eq, notExists, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError, getRequestURL } from 'h3'
import { invitations, members, organizations, users } from '../database/schema'
import { writeAuditLog } from '../utils/audit'
import { sendAuthEmail } from '../utils/auth-email'
import { throwWorkspaceWriteConflict, workspaceWritableCondition } from '../utils/workspace-write'

const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000
const RESEND_INTERVAL_MS = 60 * 1000

async function deliverInvitation(event: H3Event, invitation: typeof invitations.$inferSelect) {
  const db = drizzle(event.context.cloudflare.env.DB)
  const now = new Date()
  if (invitation.lastDeliveryAttemptAt && now.getTime() - invitation.lastDeliveryAttemptAt.getTime() < RESEND_INTERVAL_MS)
    return invitation
  const baseURL = event.node?.req ? getRequestURL(event).origin : 'http://localhost'
  try {
    await sendAuthEmail(event, {
      to: invitation.email,
      subject: 'Join your workspace on Sink',
      text: `Accept your workspace invitation: ${new URL(`/invite/${encodeURIComponent(invitation.id)}`, baseURL).toString()}`,
    })
    const [updated] = await db.update(invitations).set({
      deliveryStatus: 'sent',
      deliveryAttempts: invitation.deliveryAttempts + 1,
      lastDeliveryAttemptAt: now,
    }).where(and(
      eq(invitations.id, invitation.id),
      workspaceWritableCondition(db, invitation.organizationId),
    )).returning()
    if (!updated)
      await throwWorkspaceWriteConflict(db, invitation.organizationId, 'Invitation delivery update conflict')
    return updated
  }
  catch {
    const [updated] = await db.update(invitations).set({
      deliveryStatus: 'failed',
      deliveryAttempts: invitation.deliveryAttempts + 1,
      lastDeliveryAttemptAt: now,
    }).where(and(
      eq(invitations.id, invitation.id),
      workspaceWritableCondition(db, invitation.organizationId),
    )).returning()
    if (!updated)
      await throwWorkspaceWriteConflict(db, invitation.organizationId, 'Invitation delivery update conflict')
    await writeAuditLog(event, { action: 'invitation.delivery-failed', targetType: 'invitation', targetId: invitation.id })
    return updated
  }
}

export async function createWorkspaceInvitation(
  event: H3Event,
  workspaceId: string,
  actorUserId: string,
  input: { email: string, role: Exclude<Role, 'owner'> },
) {
  const db = drizzle(event.context.cloudflare.env.DB)
  const email = input.email.trim().toLowerCase()
  const [membership] = await db.select({ id: members.id }).from(members).innerJoin(users, eq(members.userId, users.id)).where(and(
    eq(members.organizationId, workspaceId),
    sql`lower(${users.email}) = ${email}`,
  )).limit(1)
  if (membership)
    throw createError({ status: 409, statusText: 'User is already a workspace member' })

  const [existing] = await db.select().from(invitations).where(and(
    eq(invitations.organizationId, workspaceId),
    eq(invitations.email, email),
    eq(invitations.status, 'pending'),
  )).limit(1)
  if (existing) {
    if (existing.expiresAt.getTime() <= Date.now()) {
      const [canceled] = await db.update(invitations).set({ status: 'canceled' }).where(and(
        eq(invitations.id, existing.id),
        workspaceWritableCondition(db, workspaceId),
      )).returning({ id: invitations.id })
      if (!canceled)
        await throwWorkspaceWriteConflict(db, workspaceId, 'Invitation cancellation conflict')
    }
    else {
      if (existing.role !== input.role)
        throw createError({ status: 409, statusText: 'Cancel the pending invitation before changing its role' })
      return await deliverInvitation(event, existing)
    }
  }

  const now = new Date()
  const invitation = {
    id: crypto.randomUUID(),
    organizationId: workspaceId,
    email,
    role: input.role,
    status: 'pending' as const,
    inviterId: actorUserId,
    expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
    createdAt: now,
    deliveryStatus: 'pending' as const,
    deliveryAttempts: 0,
    lastDeliveryAttemptAt: null,
  }
  const [created] = await db.insert(invitations).select(db.select({
    id: sql<string>`${invitation.id}`.as('id'),
    organizationId: sql<string>`${invitation.organizationId}`.as('organizationId'),
    email: sql<string>`${invitation.email}`.as('email'),
    role: sql<typeof invitation.role>`${invitation.role}`.as('role'),
    status: sql<typeof invitation.status>`${invitation.status}`.as('status'),
    inviterId: sql<string>`${invitation.inviterId}`.as('inviterId'),
    expiresAt: sql<Date>`${Math.floor(invitation.expiresAt.getTime() / 1000)}`.as('expiresAt'),
    createdAt: sql<Date>`${Math.floor(invitation.createdAt.getTime() / 1000)}`.as('createdAt'),
    deliveryStatus: sql<typeof invitation.deliveryStatus>`${invitation.deliveryStatus}`.as('deliveryStatus'),
    deliveryAttempts: sql<number>`${invitation.deliveryAttempts}`.as('deliveryAttempts'),
    lastDeliveryAttemptAt: sql<Date | null>`${null}`.as('lastDeliveryAttemptAt'),
  }).from(organizations).where(and(
    eq(organizations.id, workspaceId),
    workspaceWritableCondition(db, workspaceId),
    notExists(db.select({ id: members.id }).from(members).innerJoin(users, eq(members.userId, users.id)).where(and(
      eq(members.organizationId, workspaceId),
      sql`lower(${users.email}) = ${email}`,
    ))),
  ))).returning({ id: invitations.id })
  if (!created) {
    const [currentMembership] = await db.select({ id: members.id }).from(members).innerJoin(users, eq(members.userId, users.id)).where(and(
      eq(members.organizationId, workspaceId),
      sql`lower(${users.email}) = ${email}`,
    )).limit(1)
    if (currentMembership)
      throw createError({ status: 409, statusText: 'User is already a workspace member' })
    await throwWorkspaceWriteConflict(db, workspaceId, 'Invitation creation conflict')
  }
  await writeAuditLog(event, { action: 'invitation.create', targetType: 'invitation', targetId: invitation.id, metadata: { email, role: input.role } })
  return await deliverInvitation(event, invitation)
}

export async function resendWorkspaceInvitation(event: H3Event, workspaceId: string, invitationId: string) {
  const [invitation] = await drizzle(event.context.cloudflare.env.DB).select().from(invitations).where(and(
    eq(invitations.id, invitationId),
    eq(invitations.organizationId, workspaceId),
    eq(invitations.status, 'pending'),
  )).limit(1)
  if (!invitation || invitation.expiresAt.getTime() <= Date.now())
    throw createError({ status: 404, statusText: 'Invitation not found or expired' })
  if (invitation.lastDeliveryAttemptAt && Date.now() - invitation.lastDeliveryAttemptAt.getTime() < RESEND_INTERVAL_MS)
    throw createError({ status: 409, statusText: 'Invitation was sent too recently' })
  return await deliverInvitation(event, invitation)
}
