/// <reference path="../../worker-configuration.d.ts" />

import { drizzle } from 'drizzle-orm/d1'
import { organizations } from '../database/schema'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async (event) => {
    const config = useRuntimeConfig()

    if (config.disableAutoBackup) {
      console.info('[backup] Auto backup is disabled by configuration')
      return
    }

    const env = event.env as Cloudflare.Env
    const workspaces = await drizzle(env.DB).select({ id: organizations.id }).from(organizations)
    for (const workspace of workspaces)
      await backupLinksToR2(env, workspace.id)
  })
})
