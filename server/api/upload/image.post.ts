import { nanoid } from '#shared/schemas/link'
import { IMAGE_ALLOWED_TYPES, IMAGE_MAX_SIZE } from '#shared/utils/image'

defineRouteMeta({
  openAPI: {
    description: 'Upload an image to R2 storage',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file: { type: 'string', format: 'binary' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  requirePermission(event, 'links.write')
  const R2 = requireR2Bucket(event.context.cloudflare.env)
  const workspaceId = event.context.auth?.workspaceId
  if (!workspaceId)
    throw createError({ status: 403, statusText: 'An active workspace is required' })

  const formData = await readFormData(event)
  const file = formData.get('file') as File | null

  if (!file) {
    throw createError({ status: 400, statusText: 'File is required' })
  }

  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    throw createError({ status: 400, statusText: 'Invalid file type. Allowed: jpeg, png, webp, gif' })
  }

  if (file.size > IMAGE_MAX_SIZE) {
    throw createError({ status: 400, statusText: 'File size exceeds 5MB limit' })
  }

  const ext = file.type.split('/')[1]
  const key = `uploads/${workspaceId}/${nanoid(24)()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  await R2.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
  })
  await writeAuditLog(event, { action: 'asset.upload', targetType: 'r2-object', targetId: key })

  const imageUrl = `/_assets/${key}`
  return { url: imageUrl, key }
})
