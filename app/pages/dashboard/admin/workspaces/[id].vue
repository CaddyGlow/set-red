<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
const route = useRoute()
const id = route.params.id as string
const details = ref(await useAPI<any>(`/api/admin/workspaces/${encodeURIComponent(id)}`))
const editing = ref(false)
const deleting = ref(false)
function setEditing(value: unknown) {
  editing.value = value === true
}
function setDeleting(value: unknown) {
  deleting.value = value === true
}
</script>

<template>
  <main class="mx-auto max-w-4xl space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>{{ details.workspace.name }}</CardTitle><CardDescription>{{ details.workspace.slug }}</CardDescription><CardAction
          class="flex gap-2"
        >
          <Button variant="outline" @click="editing = true">
            {{ $t('admin.common.edit') }}
          </Button><Button variant="destructive" @click="deleting = true">
            {{ $t('admin.common.delete') }}
          </Button>
        </CardAction>
      </CardHeader><CardContent
        class="text-sm text-muted-foreground"
      >
        {{ details.members.length }} {{ $t('admin.workspaces.members') }} · {{ details.domains.length }} {{ $t('admin.workspaces.domains') }} · {{ details.apiKeys.length }} API keys
      </CardContent>
    </Card>
    <ResponsiveModal :open="editing" :title="$t('admin.workspaces.edit')" @update:open="setEditing">
      <AdminWorkspaceForm :workspace="details.workspace" @saved="details.workspace = $event; editing = false" />
    </ResponsiveModal>
    <AdminWorkspaceDeleteDialog :open="deleting" :workspace="details.workspace" @update:open="setDeleting" @deleted="navigateTo('/dashboard/admin/workspaces')" />
  </main>
</template>
