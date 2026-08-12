import { buildVerifyResponse } from '../services/verify-response'

defineRouteMeta({
  openAPI: { description: 'Return the authenticated user and workspace access' },
})

export default eventHandler(buildVerifyResponse)
