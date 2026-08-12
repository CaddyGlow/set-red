<script setup lang="ts">
defineProps<{ user: { id: string, email: string, isInstanceAdmin: boolean } }>()
const emit = defineEmits<{ 'saved': [enabled: boolean], 'update:open': [value: boolean] }>()
const open = defineModel<boolean>('open', { default: false })
const confirmation = ref('')
function saved(enabled: boolean) {
  emit('saved', enabled)
  open.value = false
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{{ $t('admin.users.change_admin') }}</AlertDialogTitle><AlertDialogDescription>{{ $t('admin.users.confirm_email') }}</AlertDialogDescription></AlertDialogHeader><Input v-model="confirmation" :placeholder="user.email" /><InstanceAdminStatusForm v-if="confirmation === user.email" :user="user" @saved="saved" /><AlertDialogFooter><AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel></AlertDialogFooter></AlertDialogContent>
  </AlertDialog>
</template>
