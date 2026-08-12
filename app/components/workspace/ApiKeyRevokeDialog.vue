<script setup lang="ts">
const props = defineProps<{ id: string, name: string }>()
const emit = defineEmits<{ revoked: [id: string] }>()
const open = ref(false)
const busy = ref(false)

async function revoke() {
  busy.value = true
  try {
    await useAPI('/api/workspaces/api-keys/delete', { method: 'POST', body: { id: props.id } })
    emit('revoked', props.id)
    open.value = false
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogTrigger as-child>
      <Button variant="destructive" size="sm">
        {{ $t('workspace.api_keys.revoke') }}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('workspace.api_keys.revoke_title', { name }) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ $t('workspace.api_keys.revoke_description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <AlertDialogAction variant="destructive" :disabled="busy" @click="revoke">
          {{ $t('workspace.api_keys.revoke') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
