<script setup lang="ts">
const props = defineProps<{ workspace: { id: string, name: string, slug: string } }>()
const emit = defineEmits<{ 'deleted': [], 'update:open': [value: boolean] }>()
const open = defineModel<boolean>('open', { default: false })
const confirmation = ref('')
const busy = ref(false)
async function remove() {
  busy.value = true
  try {
    await useAPI(`/api/admin/workspaces/${encodeURIComponent(props.workspace.id)}`, { method: 'DELETE', body: { confirmation: confirmation.value } })
    emit('deleted')
    open.value = false
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{{ $t('admin.workspaces.delete_title', { name: workspace.name }) }}</AlertDialogTitle><AlertDialogDescription>{{ $t('admin.workspaces.delete_description') }}</AlertDialogDescription></AlertDialogHeader><Input v-model="confirmation" :placeholder="workspace.slug" /><AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">
          {{ $t('common.cancel') }}
        </AlertDialogCancel><AlertDialogAction variant="destructive" :disabled="busy || confirmation !== workspace.slug" @click="remove">
          {{ $t('admin.common.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
