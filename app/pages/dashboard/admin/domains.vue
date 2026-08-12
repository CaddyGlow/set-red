<script setup lang="ts">
import type { AdminDomainSummary, AdminPage } from '@/types'
import { watchDebounced } from '@vueuse/core'

definePageMeta({ layout: 'dashboard' })
const search = ref('')
const creating = ref(false)
const assigning = ref<AdminDomainSummary | null>(null)
const changingStatus = ref<AdminDomainSummary | null>(null)
const deleting = ref<AdminDomainSummary | null>(null)
const page = ref(await useAPI<AdminPage<AdminDomainSummary>>('/api/admin/domains'))
async function refresh() {
  page.value = await useAPI('/api/admin/domains', { query: { q: search.value || undefined } })
}
watchDebounced(search, refresh, { debounce: 250 })
async function loadMore() {
  if (!page.value.nextCursor)
    return
  const next = await useAPI<AdminPage<AdminDomainSummary>>('/api/admin/domains', { query: { q: search.value || undefined, cursor: page.value.nextCursor } })
  page.value = { items: [...page.value.items, ...next.items], nextCursor: next.nextCursor }
}
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1
        class="text-2xl font-semibold"
      >
        {{ $t('admin.domains.title') }}
      </h1><Button @click="creating = true">
        {{ $t('admin.domains.create') }}
      </Button>
    </div>
    <Input
      v-model="search" type="search" :placeholder="$t('admin.common.search')" class="
        max-w-md
      "
    />
    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{{ $t('admin.domains.hostname') }}</TableHead><TableHead>{{ $t('admin.workspaces.title') }}</TableHead><TableHead>{{ $t('admin.domains.status') }}</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            <TableRow v-for="domain in page.items" :key="domain.id">
              <TableCell
                class="font-medium"
              >
                {{ domain.hostname }}
              </TableCell><TableCell>{{ domain.workspaceName }}</TableCell><TableCell>
                <Badge variant="secondary">
                  {{ domain.status }}
                </Badge>
              </TableCell><TableCell
                class="text-right"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="sm">
                      {{ $t('admin.common.actions') }}
                    </Button>
                  </DropdownMenuTrigger><DropdownMenuContent align="end">
                    <DropdownMenuItem @select="changingStatus = domain">
                      {{ domain.status === 'active' ? $t('admin.domains.disable') : $t('admin.domains.enable') }}
                    </DropdownMenuItem><DropdownMenuItem @select="assigning = domain">
                      {{ $t('admin.domains.assign') }}
                    </DropdownMenuItem><DropdownMenuItem variant="destructive" @select="deleting = domain">
                      {{ $t('admin.common.delete') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
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
    <ResponsiveModal :open="creating" :title="$t('admin.domains.create')" @update:open="creating = $event">
      <AdminDomainForm @saved="creating = false; refresh()" />
    </ResponsiveModal>
    <ResponsiveModal :open="!!assigning" :title="$t('admin.domains.assign')" @update:open="!$event && (assigning = null)">
      <AdminDomainAssignmentForm v-if="assigning" :domain="assigning" @saved="assigning = null; refresh()" />
    </ResponsiveModal>
    <ResponsiveModal :open="!!changingStatus" :title="$t('admin.domains.status')" @update:open="!$event && (changingStatus = null)">
      <AdminDomainStatusForm v-if="changingStatus" :domain="changingStatus" @saved="changingStatus = null; refresh()" />
    </ResponsiveModal>
    <AdminDomainDeleteDialog v-if="deleting" :domain="deleting" :open="!!deleting" @update:open="!$event && (deleting = null)" @deleted="deleting = null; refresh()" />
  </main>
</template>
