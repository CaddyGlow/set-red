import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { workspaceDeletionJobs } from '../../../../database/schema'

export default eventHandler(async (event) => {
  requireInstanceAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const [job] = await drizzle(event.context.cloudflare.env.DB).select().from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, id)).limit(1)
  if (!job)
    throw createError({ status: 404, statusText: 'Deletion job not found' })
  return job
})
