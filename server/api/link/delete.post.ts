import { z } from 'zod'
import { LinkIdSchema } from '#shared/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Delete a short link',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'The globally unique link ID' },
            },
          },
        },
      },
    },
  },
})

const DeleteSchema = z.object({
  id: LinkIdSchema,
})

export default eventHandler(async (event) => {
  requirePermission(event, 'links.write')
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot delete links.',
    })
  }

  const body = await readValidatedBody(event, DeleteSchema.parse)
  const existing = await getAnyAuthoritativeLink(event, body.id)
  if (!existing)
    throw createError({ status: 404, statusText: 'Link not found' })
  requireLinkOwnership(event, existing)
  if (!await deleteLink(event, body.id))
    throw createError({ status: 404, statusText: 'Link not found' })
})
