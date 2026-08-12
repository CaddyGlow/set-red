export default eventHandler(async (event) => {
  const R2 = requireR2Bucket(event.context.cloudflare.env)
  const key = getRouterParam(event, 'key')

  if (!key) {
    throw createError({ status: 400, statusText: 'Key is required' })
  }

  // Asset keys are unguessable and immutable; this endpoint never lists a prefix.
  if (!/^uploads\/[^/]+\/[\w-]{24}\.[a-z\d]+$/i.test(key)) {
    throw createError({ status: 403, statusText: 'Access denied' })
  }

  const object = await R2.get(key)

  if (!object) {
    throw createError({ status: 404, statusText: 'Image not found' })
  }

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream'

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'ETag', object.etag)

  return object.body
})
