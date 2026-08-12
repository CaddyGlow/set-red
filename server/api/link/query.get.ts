import { z } from 'zod'
import { LinkIdSchema } from '#shared/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Query a short link by globally unique ID',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'id',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'The globally unique ID of the link to query',
      },
    ],
  },
})

const QueryParamsSchema = z.object({
  id: LinkIdSchema,
})

export default eventHandler(async (event) => {
  requirePermission(event, 'links.read')
  const query = await getValidatedQuery(event, QueryParamsSchema.parse)
  const { link, metadata } = await getLinkWithMetadata(event, query.id)
  if (link) {
    return sanitizeLinkPassword({
      ...metadata,
      ...link,
    })
  }

  throw createError({
    status: 404,
    statusText: 'Not Found',
  })
})
