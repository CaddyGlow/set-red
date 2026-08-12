<script setup lang="ts">
import type { AdminAuditSummary, AdminPage } from '@/types'
import { watchDebounced } from '@vueuse/core'

definePageMeta({ layout: 'dashboard' })
const action = ref('')
const page = ref(await useAPI<AdminPage<AdminAuditSummary>>('/api/admin/audit'))
watchDebounced(action, async (value) => {
  page.value = await useAPI('/api/admin/audit', { query: { action: value || undefined } })
}, { debounce: 250 })
async function loadMore() {
  if (!page.value.nextCursor)
    return
  const next = await useAPI<AdminPage<AdminAuditSummary>>('/api/admin/audit', { query: { action: action.value || undefined, cursor: page.value.nextCursor } })
  page.value = { items: [...page.value.items, ...next.items], nextCursor: next.nextCursor }
}
</script>

<template>
  <main class="space-y-6">
    <h1 class="text-2xl font-semibold">
      {{ $t('admin.audit.title') }}
    </h1>
    <Input
      v-model="action" type="search" :placeholder="$t('admin.audit.action_filter')" class="
        max-w-md
      "
    />
    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{{ $t('admin.audit.action') }}</TableHead><TableHead>{{ $t('admin.audit.actor') }}</TableHead><TableHead>{{ $t('admin.audit.target') }}</TableHead><TableHead>{{ $t('admin.audit.time') }}</TableHead></TableRow></TableHeader><TableBody>
            <TableRow v-for="entry in page.items" :key="entry.id">
              <TableCell
                class="font-medium"
              >
                {{ entry.action }}
              </TableCell><TableCell>{{ entry.actorType }}: {{ entry.actorId }}</TableCell><TableCell>{{ entry.targetType }}<span v-if="entry.targetId">: {{ entry.targetId }}</span></TableCell><TableCell>{{ new Date(entry.createdAt * 1000).toLocaleString() }}</TableCell>
            </TableRow>
            <TableEmpty v-if="!page.items.length" :colspan="4">
              {{ $t('admin.common.empty') }}
            </TableEmpty>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <Button v-if="page.nextCursor" variant="outline" @click="loadMore">
      {{ $t('admin.common.more') }}
    </Button>
  </main>
</template>
