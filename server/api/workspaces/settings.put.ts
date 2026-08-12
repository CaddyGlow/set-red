import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { WorkspaceSettingsSchema } from '#shared/schemas/workspace'
import { workspaceSettings } from '../../database/schema'

export default eventHandler(async (event) => {
  requirePermission(event, 'workspace.settings')
  const workspaceId = requireWorkspace(event)
  const input = await readValidatedBody(event, WorkspaceSettingsSchema.parse)
  const updates = input.webhookSecret === '••••••••'
    ? { ...input, webhookSecret: undefined }
    : input
  const [settings] = await drizzle(event.context.cloudflare.env.DB)
    .update(workspaceSettings)
    .set(updates)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .returning()
  if (!settings)
    throw createError({ status: 404, statusText: 'Workspace settings not found' })
  await writeAuditLog(event, { action: 'workspace.settings.update', targetType: 'workspace', targetId: workspaceId })
  return { ...settings, webhookSecret: settings.webhookSecret ? '••••••••' : null }
})
