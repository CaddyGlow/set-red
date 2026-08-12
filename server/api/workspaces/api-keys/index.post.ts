import { permissionsToStatement } from '#shared/auth/permissions'
import { CreateWorkspaceApiKeySchema } from '#shared/schemas/api-key'

export default eventHandler(async (event) => {
  const authContext = requireAuth(event)
  const workspaceId = requireWorkspace(event)
  const input = await readValidatedBody(event, CreateWorkspaceApiKeySchema.parse)
  const mayManage = authContext.permissions.includes('apiKeys.manage')
  if (!mayManage && !authContext.permissions.includes('apiKeys.own'))
    throw createError({ status: 403, statusText: 'Forbidden' })
  if (input.independentService && !mayManage)
    throw createError({ status: 403, statusText: 'Only administrators can create service keys' })
  if (input.permissions.some(permission => !authContext.permissions.includes(permission)))
    throw createError({ status: 403, statusText: 'API-key permissions exceed the creator grant' })
  if (!authContext.user)
    throw createError({ status: 403, statusText: 'A user session is required' })

  const key = await useBetterAuth(event).api.createApiKey({
    body: {
      configId: 'workspace',
      name: input.name,
      organizationId: workspaceId,
      userId: authContext.user.id,
      expiresIn: input.expiresIn,
      permissions: permissionsToStatement(input.permissions),
      metadata: { creatorUserId: authContext.user.id, independentService: input.independentService },
    },
  })
  await writeAuditLog(event, { action: 'api-key.create', targetType: 'api-key', targetId: key.id, metadata: { independentService: input.independentService } })
  return key
})
