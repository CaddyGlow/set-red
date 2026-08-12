/// <reference path="../../worker-configuration.d.ts" />

import { eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { organizations, workspaceDeletionJobs } from '../database/schema'
import { processDueWorkspaceDeletions } from '../services/workspace-deletion'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async (event) => {
    const config = useRuntimeConfig()

    if (config.disableAutoBackup) {
      console.info('[backup] Auto backup is disabled by configuration')
      return
    }

    const env = event.env as Cloudflare.Env
    await processDueWorkspaceDeletions(env)
    const workspaces = await drizzle(env.DB).select({ id: organizations.id }).from(organizations).leftJoin(workspaceDeletionJobs, eq(organizations.id, workspaceDeletionJobs.workspaceId)).where(isNull(workspaceDeletionJobs.workspaceId))
    for (const workspace of workspaces)
      await backupLinksToR2(env, workspace.id)
  })
})
