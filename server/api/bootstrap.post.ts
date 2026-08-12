import { z } from 'zod'
import { bootstrapInstance } from '../services/bootstrap'

const BootstrapSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(128),
  workspaceName: z.string().trim().min(1).max(128),
  workspaceSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  primaryHostname: z.string().trim().min(1),
}).strict()

function constantTimeMatches(actual: string, expected: string): boolean {
  const encoder = new TextEncoder()
  const actualBytes = encoder.encode(actual)
  const expectedBytes = encoder.encode(expected)
  let mismatch = actualBytes.length ^ expectedBytes.length
  for (let index = 0; index < Math.max(actualBytes.length, expectedBytes.length); index++)
    mismatch |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0)
  return mismatch === 0
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const expectedToken = String(config.authBootstrapToken)
  const expiresAt = Date.parse(String(config.authBootstrapExpiresAt))
  const suppliedToken = getHeader(event, 'x-bootstrap-token') ?? ''
  if (!expectedToken || !Number.isFinite(expiresAt) || Date.now() >= expiresAt || !constantTimeMatches(suppliedToken, expectedToken))
    throw createError({ status: 403, statusText: 'Bootstrap token is invalid or expired' })

  const result = await bootstrapInstance(
    event.context.cloudflare.env,
    await readValidatedBody(event, BootstrapSchema.parse),
    { appHostname: String(config.appHostname), shortLinkHostnames: String(config.shortLinkHostnames) },
  )
  setResponseStatus(event, 201)
  return result
})
