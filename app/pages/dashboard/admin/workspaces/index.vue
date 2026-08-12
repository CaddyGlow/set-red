<script setup lang="ts">
import type { AdminPage, AdminWorkspaceSummary } from '@/types'
import { watchDebounced } from '@vueuse/core'

definePageMeta({ layout: 'dashboard' })
const search = ref('')
const page = ref(await useAPI<AdminPage<AdminWorkspaceSummary>>('/api/admin/workspaces'))
let controller: AbortController | undefined
watchDebounced(search, async (q) => {
  controller?.abort()
  controller = new AbortController()
  page.value = await useAPI('/api/admin/workspaces', { query: { q: q || undefined }, signal: controller.signal })
}, { debounce: 250 })
</script>

<template>
  <main class="space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ $t('admin.workspaces.title') }}
    </h1>
    <Input
      v-model="search" type="search" :placeholder="$t('admin.common.search')" class="
        max-w-md
      "
    />
    <div
      class="
        grid gap-4
        md:grid-cols-2
      "
    >
      <Card v-for="workspace in page.items" :key="workspace.id" size="sm">
        <CardHeader>
          <CardTitle>
            <NuxtLink :to="`/dashboard/admin/workspaces/${workspace.id}`">
              {{ workspace.name }}
            </NuxtLink>
          </CardTitle><CardDescription>{{ workspace.slug }}</CardDescription><CardAction>
            <Badge v-if="workspace.deletionState" variant="destructive">
              {{ workspace.deletionState }}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent class="text-sm text-muted-foreground">
          {{ workspace.memberCount }} {{ $t('admin.workspaces.members') }} · {{ workspace.domainCount }} {{ $t('admin.workspaces.domains') }} · {{ workspace.linkCount }} {{ $t('admin.workspaces.links') }}
        </CardContent>
      </Card>
      <Card v-if="!page.items.length">
        <CardContent>{{ $t('admin.common.empty') }}</CardContent>
      </Card>
    </div>
  </main>
</template>
