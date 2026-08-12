<script setup lang="ts">
import type { AdminPage, AdminUserSummary } from '@/types'

definePageMeta({ layout: 'dashboard' })
const route = useRoute()
const router = useRouter()
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const page = ref(await useAPI<AdminPage<AdminUserSummary>>('/api/admin/users', { query: { q: search.value || undefined } }))
let controller: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    controller?.abort()
    controller = new AbortController()
    await router.replace({ query: value ? { q: value } : {} })
    page.value = await useAPI('/api/admin/users', { query: { q: value || undefined }, signal: controller.signal })
  }, 250)
})
async function loadMore() {
  if (!page.value.nextCursor)
    return
  const next = await useAPI<AdminPage<AdminUserSummary>>('/api/admin/users', { query: { q: search.value || undefined, cursor: page.value.nextCursor } })
  page.value = { items: [...page.value.items, ...next.items], nextCursor: next.nextCursor }
}
</script>

<template>
  <main class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ $t('admin.users.title') }}
      </h1>
    </div>
    <Input
      v-model="search" type="search" :placeholder="$t('admin.common.search')" class="
        max-w-md
      "
    />
    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{{ $t('admin.common.name') }}</TableHead><TableHead>{{ $t('admin.common.email') }}</TableHead><TableHead>{{ $t('admin.users.workspaces') }}</TableHead><TableHead>{{ $t('admin.users.status') }}</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow v-for="user in page.items" :key="user.id">
              <TableCell>
                <NuxtLink
                  class="
                    font-medium underline-offset-4
                    hover:underline
                  " :to="`/dashboard/admin/users/${user.id}`"
                >
                  {{ user.name }}
                </NuxtLink>
              </TableCell>
              <TableCell>{{ user.email }}</TableCell><TableCell>{{ user.workspaceCount }}</TableCell>
              <TableCell>
                <Badge :variant="user.isInstanceAdmin ? 'default' : 'secondary'">
                  {{ user.isInstanceAdmin ? $t('admin.users.admin') : $t('admin.users.user') }}
                </Badge>
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
  </main>
</template>
