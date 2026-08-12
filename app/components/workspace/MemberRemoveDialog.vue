<script setup lang="ts">
const props = defineProps<{ workspaceId: string, memberId: string, name: string }>()
const emit = defineEmits<{ removed: [id: string] }>()

async function remove() {
  await useAPI(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/members/${encodeURIComponent(props.memberId)}`, { method: 'DELETE' })
  emit('removed', props.memberId)
}
</script>

<template>
  <AlertDialog>
    <AlertDialogTrigger as-child>
      <Button variant="destructive" size="sm">
        {{ $t('workspace.members.remove') }}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('workspace.members.remove_title', { name }) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ $t('workspace.members.remove_description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="remove">
          {{ $t('workspace.members.remove') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
