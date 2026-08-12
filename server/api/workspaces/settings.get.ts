import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { workspaceSettings } from '../../database/schema'

export default eventHandler(async (event) => {
  requirePermission(event, 'links.read')
  const workspaceId = requireWorkspace(event)
  const [settings] = await drizzle(event.context.cloudflare.env.DB)
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1)
  if (!settings)
    throw createError({ status: 404, statusText: 'Workspace settings not found' })
  return { ...settings, webhookSecret: settings.webhookSecret ? '••••••••' : null }
})
