<script setup lang="ts">
import type { WorkspaceSettings } from '#shared/schemas/workspace'

definePageMeta({ layout: 'dashboard' })
const settings = await useAPI<WorkspaceSettings>('/api/workspaces/settings')
</script>

<template>
  <main class="mx-auto max-w-2xl">
    <Card>
      <CardHeader><CardTitle>{{ $t('workspace.settings.title') }}</CardTitle></CardHeader>
      <CardContent><WorkspaceWorkspaceSettingsForm :settings="settings" /></CardContent>
    </Card>
  </main>
</template>
