import type { H3Event } from 'h3'
import type { Role } from '#shared/auth/permissions'
import { apiKey } from '@better-auth/api-key'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { createAccessControl, organization } from 'better-auth/plugins'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { can, isRole, permissionsForRole, permissionStatement, permissionsToStatement, rolePermissions } from '#shared/auth/permissions'
import * as schema from '../database/schema'

const betterAuthPermissionStatement = {
  ...permissionStatement,
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
} as const

export const workspaceAccessControl = createAccessControl(betterAuthPermissionStatement)

function betterAuthPermissions(role: Role) {
  const permissions = permissionsToStatement(rolePermissions[role])
  const organizationPermissions: ('update' | 'delete')[] = []
  if (can(role, 'workspace.settings'))
    organizationPermissions.push('update')
  if (can(role, 'workspace.delete'))
    organizationPermissions.push('delete')
  const memberPermissions: ('create' | 'update' | 'delete')[] = can(role, 'members.change-role')
    ? ['create', 'update', 'delete']
    : []
  const invitationPermissions: ('create' | 'cancel')[] = can(role, 'members.invite')
    ? ['create', 'cancel']
    : []
  return {
    ...permissions,
    organization: organizationPermissions,
    member: memberPermissions,
    invitation: invitationPermissions,
  }
}

export const workspaceRoles = {
  owner: workspaceAccessControl.newRole(betterAuthPermissions('owner')),
  admin: workspaceAccessControl.newRole(betterAuthPermissions('admin')),
  member: workspaceAccessControl.newRole(betterAuthPermissions('member')),
  viewer: workspaceAccessControl.newRole(betterAuthPermissions('viewer')),
}

function assertSingleRole(role: string): void {
  if (role.includes(',') || !isRole(role))
    throw new APIError('BAD_REQUEST', { message: 'Memberships require exactly one supported role' })
}

export function useBetterAuth(event: H3Event) {
  const config = useRuntimeConfig(event)
  const baseURL = config.authBaseURL || getRequestURL(event).origin
  const trustedOrigins = String(config.authTrustedOrigins || baseURL)
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  return betterAuth({
    appName: 'Sink',
    baseURL,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins,
    database: drizzleAdapter(drizzle(event.context.cloudflare.env.DB), {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
        apikey: schema.apiKeys,
      },
    }),
    user: {
      additionalFields: {
        isInstanceAdmin: {
          type: 'boolean',
          required: true,
          defaultValue: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: config.authEmailPasswordEnabled,
      // Public registration is gated in middleware; the server-side invitation
      // enrollment route still needs Better Auth's sign-up API while it is off.
      disableSignUp: false,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(event, {
          to: user.email,
          subject: 'Reset your Sink password',
          text: `Reset your password: ${url}`,
        })
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(event, {
          to: user.email,
          subject: 'Verify your Sink email',
          text: `Verify your email address: ${url}`,
        })
      },
    },
    advanced: {
      useSecureCookies: baseURL.startsWith('https://'),
    },
    plugins: [
      organization({
        ac: workspaceAccessControl,
        roles: workspaceRoles,
        allowUserToCreateOrganization: false,
        creatorRole: 'owner',
        requireEmailVerificationOnInvitation: true,
        organizationHooks: {
          beforeAddMember: async ({ member }) => assertSingleRole(member.role),
          beforeUpdateMemberRole: async ({ newRole }) => assertSingleRole(newRole),
          beforeCreateInvitation: async ({ invitation }) => assertSingleRole(invitation.role),
          afterRemoveMember: async ({ member }) => {
            await drizzle(event.context.cloudflare.env.DB).update(schema.apiKeys).set({ enabled: false }).where(and(
              eq(schema.apiKeys.referenceId, member.organizationId),
              sql`json_extract(${schema.apiKeys.metadata}, '$.creatorUserId') = ${member.userId}`,
            ))
          },
        },
        sendInvitationEmail: async ({ id, email, organization: invitedOrganization }) => {
          const inviteUrl = new URL(`/invite/${encodeURIComponent(id)}`, baseURL).toString()
          await sendAuthEmail(event, {
            to: email,
            subject: `Join ${invitedOrganization.name} on Sink`,
            text: `Accept your workspace invitation: ${inviteUrl}`,
          })
        },
      }),
      apiKey({
        configId: 'workspace',
        references: 'organization',
        requireName: true,
        enableMetadata: true,
        customAPIKeyGetter: (ctx) => {
          const authorization = ctx.headers?.get('authorization')
          return authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null
        },
        permissions: {
          defaultPermissions: permissionsToStatement(permissionsForRole('viewer')),
        },
      }),
    ],
  })
}
