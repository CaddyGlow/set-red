import { z } from 'zod'
import { roles } from '../auth/permissions'
import { isSafeWebhookUrl } from '../utils/webhook-url'

export const WorkspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
}).strict()

export const WorkspaceUpdateSchema = WorkspaceCreateSchema.partial().refine(
  value => Object.keys(value).length > 0,
  'At least one workspace field is required',
)

export const WorkspaceInvitationSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(roles).exclude(['owner']),
}).strict()

export const InvitationRegistrationSchema = z.object({
  invitationId: z.string().trim().min(1).max(256),
  name: z.string().trim().min(1).max(128),
  password: z.string().min(12).max(128),
}).strict()

export const WorkspaceMemberRoleSchema = z.object({
  role: z.enum(roles),
}).strict()

export const WorkspaceOwnershipTransferSchema = z.object({
  targetMemberId: z.string().trim().min(1).max(256),
}).strict()

const WebhookUrlSchema = z.string().trim().url().max(2048).refine(isSafeWebhookUrl, 'Webhook URL must use HTTPS and a public destination')

export const InternalWorkspaceSettingsSchema = z.object({
  webhookUrl: z.string().nullable(),
  webhookSecret: z.string().trim().min(24).max(128).nullable().optional(),
  defaultSlugLength: z.number().int().min(3).max(32),
  caseSensitive: z.boolean(),
  redirectStatusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
}).strict()

export const WorkspaceSettingsUpdateSchema = z.object({
  webhookUrl: WebhookUrlSchema.nullable().optional(),
  defaultSlugLength: z.number().int().min(3).max(32).optional(),
  caseSensitive: z.boolean().optional(),
  redirectStatusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one workspace setting is required')

export const WorkspaceSettingsSchema = z.object({
  webhookUrl: z.string().nullable(),
  webhookSecretConfigured: z.boolean(),
  defaultSlugLength: z.number().int().min(3).max(32),
  caseSensitive: z.boolean(),
  redirectStatusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
}).strict()

export type InternalWorkspaceSettings = z.infer<typeof InternalWorkspaceSettingsSchema>
export type WorkspaceSettingsUpdate = z.infer<typeof WorkspaceSettingsUpdateSchema>
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>
