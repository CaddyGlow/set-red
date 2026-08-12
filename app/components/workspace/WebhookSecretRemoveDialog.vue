<script setup lang="ts">
import { toast } from 'vue-sonner'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ removed: [] }>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const { t } = useI18n()

async function remove() {
  busy.value = true
  error.value = ''
  try {
    await useAPI('/api/workspaces/settings/webhook-secret', { method: 'DELETE' })
    emit('removed')
    open.value = false
    toast.success(t('workspace.settings.webhooks.removed'))
  }
  catch (caught) {
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.secret'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogTrigger as-child>
      <Button type="button" variant="destructive" :disabled="disabled">
        {{ $t('workspace.settings.webhooks.remove') }}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{{ $t('workspace.settings.webhooks.remove_title') }}</AlertDialogTitle><AlertDialogDescription>{{ $t('workspace.settings.webhooks.remove_description') }}</AlertDialogDescription></AlertDialogHeader>
      <Alert v-if="error" variant="destructive" role="alert">
        <AlertTitle>{{ error }}</AlertTitle>
      </Alert>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">
          {{ $t('common.cancel') }}
        </AlertDialogCancel><AlertDialogAction variant="destructive" :disabled="busy" @click="remove">
          <Spinner v-if="busy" />{{ $t('workspace.settings.webhooks.remove') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
