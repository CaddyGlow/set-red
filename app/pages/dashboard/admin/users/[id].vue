<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
const route = useRoute()
const user = ref(await useAPI<any>(`/api/admin/users/${encodeURIComponent(route.params.id as string)}`))
const statusOpen = ref(false)
</script>

<template>
  <main class="mx-auto max-w-3xl space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>{{ user.name }}</CardTitle><CardDescription>{{ user.email }}</CardDescription><CardAction>
          <Button variant="outline" @click="statusOpen = true">
            {{ $t('admin.users.change_admin') }}
          </Button>
        </CardAction>
      </CardHeader><CardContent
        class="space-y-2 text-sm"
      >
        <p>ID: {{ user.id }}</p><p>{{ $t('admin.users.providers') }}: {{ user.providers.map((provider: any) => provider.providerId).join(', ') || '—' }}</p><p>{{ $t('admin.users.workspaces') }}: {{ user.workspaces.length }}</p>
      </CardContent>
    </Card>
    <InstanceAdminStatusDialog :open="statusOpen" :user="user" @update:open="statusOpen = $event" @saved="user.isInstanceAdmin = $event; statusOpen = false" />
  </main>
</template>
