<script setup lang="ts">
import type { WorkspaceDeletionStatus } from '#shared/types/workspace'

interface DeletionPreflight { linkCount: number, activeDomainCount: number, canDelete: boolean }
const props = defineProps<{ workspace: { id: string, name: string, slug: string }, preflight: DeletionPreflight, disabled?: boolean }>()
const emit = defineEmits<{ requested: [status: WorkspaceDeletionStatus] }>()
const open = ref(false)
const confirmation = ref('')
const busy = ref(false)
const error = ref('')
const { t } = useI18n()

async function remove() {
  busy.value = true
  error.value = ''
  try {
    const status = await useAPI<WorkspaceDeletionStatus>(`/api/workspaces/${encodeURIComponent(props.workspace.id)}`, { method: 'DELETE', body: { confirmation: confirmation.value } })
    emit('requested', status)
    open.value = false
    confirmation.value = ''
  }
  catch (caught) {
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.delete'))
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
        {{ $t('workspace.settings.deletion.action') }}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{{ $t('workspace.settings.deletion.confirm_title', { name: workspace.name }) }}</AlertDialogTitle><AlertDialogDescription>{{ $t('workspace.settings.deletion.confirm_description', { slug: workspace.slug }) }}</AlertDialogDescription></AlertDialogHeader>
      <Alert v-if="error" variant="destructive" role="alert">
        <AlertTitle>{{ error }}</AlertTitle>
      </Alert>
      <Alert v-if="!preflight.canDelete" variant="destructive">
        <AlertTitle>{{ $t('workspace.settings.deletion.dependencies_title') }}</AlertTitle><AlertDescription>{{ $t('workspace.settings.deletion.dependencies_description', { links: preflight.linkCount, domains: preflight.activeDomainCount }) }}</AlertDescription>
      </Alert>
      <Field>
        <FieldLabel for="workspace-delete-confirmation">
          {{ $t('workspace.settings.deletion.confirm_label') }}
        </FieldLabel><Input id="workspace-delete-confirmation" v-model="confirmation" autocomplete="off" :placeholder="workspace.slug" />
      </Field>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">
          {{ $t('common.cancel') }}
        </AlertDialogCancel><Button type="button" variant="destructive" :disabled="busy || !preflight.canDelete || confirmation !== workspace.slug" @click="remove">
          <Spinner v-if="busy" />{{ $t('workspace.settings.deletion.confirm') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
