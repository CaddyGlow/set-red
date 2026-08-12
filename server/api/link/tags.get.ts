defineRouteMeta({
  openAPI: {
    description: 'List tags currently used by links',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  requirePermission(event, 'links.read')
  return await listTags(event)
})
