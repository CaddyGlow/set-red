<script setup lang="ts">
import type { AdminOverview } from '@/types'

definePageMeta({ layout: 'dashboard' })
const overview = await useAPI<AdminOverview>('/api/admin/overview')
const metrics = computed(() => [
  ['admin.overview.users', overview.users],
  ['admin.overview.workspaces', overview.workspaces],
  ['admin.overview.domains', overview.activeDomains + overview.disabledDomains],
  ['admin.overview.links', overview.links],
  ['admin.overview.admins', overview.instanceAdmins],
  ['admin.overview.invitations', overview.pendingInvitations],
])
</script>

<template>
  <main class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ $t('admin.overview.title') }}
      </h1>
      <p class="text-muted-foreground">
        {{ $t('admin.overview.description') }}
      </p>
    </div>
    <div
      class="
        grid gap-4
        sm:grid-cols-2
        xl:grid-cols-3
      "
    >
      <Card v-for="[label, value] in metrics" :key="label" size="sm">
        <CardHeader>
          <CardDescription>{{ $t(label as string) }}</CardDescription>
          <CardTitle class="text-2xl">
            {{ value }}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  </main>
</template>
