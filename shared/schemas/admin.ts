import { z } from 'zod'
import { DomainHostnameSchema } from './domain'

const IdSchema = z.string().trim().min(1).max(256)
const SearchSchema = z.string().trim().max(128).optional()
const CursorSchema = z.string().trim().max(1024).optional()
const LimitSchema = z.coerce.number().int().min(1).max(100).default(25)

export const AdminListQuerySchema = z.object({ cursor: CursorSchema, limit: LimitSchema, q: SearchSchema }).strict()
export const AdminUsersQuerySchema = AdminListQuerySchema.extend({ admin: z.enum(['true', 'false']).optional() }).strict()
export const AdminDomainsQuerySchema = AdminListQuerySchema.extend({
  status: z.enum(['active', 'disabled']).optional(),
  workspaceId: IdSchema.optional(),
}).strict()
export const AdminAuditQuerySchema = z.object({
  cursor: CursorSchema,
  limit: LimitSchema,
  workspaceId: IdSchema.optional(),
  actorId: IdSchema.optional(),
  action: z.string().trim().min(1).max(128).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
}).strict().refine(value => value.from === undefined || value.to === undefined || value.from <= value.to, 'Invalid audit date range')

export const InstanceAdminStatusSchema = z.object({ enabled: z.boolean() }).strict()
export const AdminWorkspaceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one workspace field is required')
export const AdminWorkspaceDeleteSchema = z.object({ confirmation: z.string().trim().min(1).max(64) }).strict()
export const AdminDomainCreateSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  hostname: DomainHostnameSchema,
  status: z.enum(['active', 'disabled']).default('active'),
  isPrimary: z.boolean().default(false),
  notFoundRedirect: z.string().trim().url().max(2048).nullable().optional(),
  homeUrl: z.string().trim().url().max(2048).nullable().optional(),
}).strict()
export const AdminDomainAssignmentSchema = z.object({ workspaceId: IdSchema }).strict()
export const AdminDomainStatusSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict()
