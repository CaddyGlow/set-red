import { z } from 'zod'

const DeleteImageSchema = z.object({ key: z.string().min(1).max(512) }).strict()

export default eventHandler(async (event) => {
  requirePermission(event, 'links.write')
  const workspaceId = requireWorkspace(event)
  const { key } = await readValidatedBody(event, DeleteImageSchema.parse)
  if (!key.startsWith(`uploads/${workspaceId}/`) || !/^uploads\/[^/]+\/[\w-]{24}\.[a-z\d]+$/i.test(key)) {
    setResponseStatus(event, 404, 'Asset not found')
    return { success: false }
  }
  await requireR2Bucket(event.context.cloudflare.env).delete(key)
  await writeAuditLog(event, { action: 'asset.delete', targetType: 'r2-object', targetId: key })
  return { success: true }
})
