import { eq, notExists } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { workspaceDeletionJobs } from '../database/schema'

export const WORKSPACE_WRITE_MAX_DURATION_MS = 45_000

export function workspaceWritableCondition(db: ReturnType<typeof drizzle>, workspaceId: string) {
  return notExists(
    db.select({ workspaceId: workspaceDeletionJobs.workspaceId })
      .from(workspaceDeletionJobs)
      .where(eq(workspaceDeletionJobs.workspaceId, workspaceId)),
  )
}

export async function throwWorkspaceWriteConflict(
  db: ReturnType<typeof drizzle>,
  workspaceId: string,
  fallbackStatusText = 'Workspace write conflict',
): Promise<never> {
  const [deletion] = await db.select({ workspaceId: workspaceDeletionJobs.workspaceId })
    .from(workspaceDeletionJobs)
    .where(eq(workspaceDeletionJobs.workspaceId, workspaceId))
    .limit(1)
  if (deletion)
    throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
  throw createError({ status: 409, statusText: fallbackStatusText })
}

export async function assertWorkspaceStorageWriteAllowed(env: Cloudflare.Env, workspaceId: string, startedAt: number): Promise<void> {
  if (Date.now() - startedAt > WORKSPACE_WRITE_MAX_DURATION_MS)
    throw createError({ status: 503, statusText: 'Workspace storage operation exceeded its maximum duration' })

  const [deletion] = await drizzle(env.DB).select({ workspaceId: workspaceDeletionJobs.workspaceId }).from(workspaceDeletionJobs).where(eq(workspaceDeletionJobs.workspaceId, workspaceId)).limit(1)
  if (deletion)
    throw createError({ status: 409, statusText: 'Workspace deletion is in progress' })
}
