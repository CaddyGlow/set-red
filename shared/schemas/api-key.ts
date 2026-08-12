import { z } from 'zod'
import { isPermission } from '../auth/permissions'

export const CreateWorkspaceApiKeySchema = z.object({
  name: z.string().trim().min(1).max(64),
  permissions: z.array(z.string().refine(isPermission)).min(1),
  expiresIn: z.number().int().positive().optional(),
  independentService: z.boolean().default(false),
}).strict()

export const DeleteWorkspaceApiKeySchema = z.object({ id: z.string().min(1) }).strict()
