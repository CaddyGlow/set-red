import { z } from 'zod'

export const DomainIdSchema = z.string().trim().min(1).max(128)

export const DomainHostnameSchema = z.string().trim().min(1).max(253).transform((value, context) => {
  try {
    const hostname = new URL(`http://${value}`).hostname.toLowerCase().replace(/\.$/, '')
    if (!hostname || hostname.includes(':'))
      throw new Error('Invalid hostname')
    return hostname
  }
  catch {
    context.addIssue({ code: 'custom', message: 'Invalid hostname' })
    return z.NEVER
  }
})

const OptionalRedirectSchema = z.string().trim().url().max(2048).nullable().optional()

export const CreateDomainSchema = z.object({
  id: DomainIdSchema,
  workspaceId: z.string().trim().min(1).max(128),
  hostname: DomainHostnameSchema,
  status: z.enum(['active', 'disabled']).default('active'),
  isPrimary: z.boolean().default(false),
  notFoundRedirect: OptionalRedirectSchema,
  homeUrl: OptionalRedirectSchema,
})

export const UpdateDomainSchema = z.object({
  id: DomainIdSchema,
  status: z.enum(['active', 'disabled']).optional(),
  isPrimary: z.boolean().optional(),
  notFoundRedirect: OptionalRedirectSchema,
  homeUrl: OptionalRedirectSchema,
}).refine(value => Object.keys(value).length > 1, 'At least one field must be updated')

export const AssignDomainSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
}).strict()

export type Domain = z.infer<typeof CreateDomainSchema> & { createdAt: number }
