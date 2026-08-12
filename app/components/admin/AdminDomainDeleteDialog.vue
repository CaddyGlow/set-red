<script setup lang="ts">
import type { AdminDomainSummary } from '@/types'

const props = defineProps<{ domain: AdminDomainSummary }>()
const emit = defineEmits<{ 'deleted': [], 'update:open': [value: boolean] }>()
const open = defineModel<boolean>('open', { default: false })
const confirmation = ref('')
const busy = ref(false)
async function remove() {
  busy.value = true
  try {
    await useAPI(`/api/admin/domains/${encodeURIComponent(props.domain.id)}`, { method: 'DELETE' })
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
      <AlertDialogHeader><AlertDialogTitle>{{ $t('admin.domains.delete_title', { hostname: domain.hostname }) }}</AlertDialogTitle><AlertDialogDescription>{{ $t('admin.domains.delete_description') }}</AlertDialogDescription></AlertDialogHeader><Input v-model="confirmation" :placeholder="domain.hostname" /><AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">
          {{ $t('common.cancel') }}
        </AlertDialogCancel><AlertDialogAction variant="destructive" :disabled="busy || confirmation !== domain.hostname" @click="remove">
          {{ $t('admin.common.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
