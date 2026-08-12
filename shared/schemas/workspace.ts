import { z } from 'zod'
import { roles } from '../auth/permissions'

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

export const WorkspaceSettingsSchema = z.object({
  webhookUrl: z.string().trim().url().max(2048).nullable().optional(),
  webhookSecret: z.string().trim().min(24).max(128).nullable().optional(),
  defaultSlugLength: z.number().int().min(3).max(32),
  caseSensitive: z.boolean(),
  redirectStatusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
}).strict()

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>
