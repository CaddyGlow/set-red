<script setup lang="ts">
import type { VerifyResponse, WorkspaceSummary } from '@/types'
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

const props = defineProps<{ workspace: WorkspaceSummary, disabled?: boolean }>()
const emit = defineEmits<{ updated: [workspace: WorkspaceSummary] }>()
const { t } = useI18n()
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const { setAuthSession } = useAuthSession()
const initial = { name: props.workspace.name, slug: props.workspace.slug }
const form = useForm({
  defaultValues: initial,
  onSubmit: async ({ value, formApi }) => {
    error.value = ''
    fieldErrors.value = validateWorkspaceIdentity(value)
    if (Object.keys(fieldErrors.value).length)
      return
    try {
      const body = changedWorkspaceValues(initial, value)
      if (!Object.keys(body).length)
        return
      const workspace = await useAPI<WorkspaceSummary>(`/api/workspaces/${encodeURIComponent(props.workspace.id)}`, { method: 'PATCH', body })
      Object.assign(initial, { name: workspace.name, slug: workspace.slug })
      formApi.reset({ name: workspace.name, slug: workspace.slug })
      setAuthSession(await useAPI<VerifyResponse>('/api/verify'))
      emit('updated', workspace)
      toast.success(t('workspace.settings.general.saved'))
    }
    catch (caught) {
      error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.save'))
    }
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <Alert v-if="error" variant="destructive" role="alert">
      <AlertTitle>{{ error }}</AlertTitle>
    </Alert>
    <FieldGroup :data-disabled="disabled || undefined">
      <form.Field v-slot="{ field }" name="name">
        <Field :data-invalid="!!fieldErrors.name || undefined">
          <FieldLabel for="workspace-name">
            {{ $t('workspace.settings.general.name') }}
          </FieldLabel><Input id="workspace-name" required maxlength="128" :aria-invalid="!!fieldErrors.name" :disabled="disabled" :model-value="field.state.value" @input="fieldErrors.name = ''; field.handleChange(($event.target as HTMLInputElement).value)" /><FieldError v-if="fieldErrors.name">
            {{ fieldErrors.name }}
          </FieldError>
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="slug">
        <Field :data-invalid="!!fieldErrors.slug || undefined">
          <FieldLabel for="workspace-slug">
            {{ $t('workspace.settings.general.slug') }}
          </FieldLabel><Input id="workspace-slug" required maxlength="64" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" :aria-invalid="!!fieldErrors.slug" :disabled="disabled" :model-value="field.state.value" @input="fieldErrors.slug = ''; field.handleChange(($event.target as HTMLInputElement).value)" /><FieldDescription>{{ $t('workspace.settings.general.slug_description') }}</FieldDescription><FieldError v-if="fieldErrors.slug">
            {{ fieldErrors.slug }}
          </FieldError>
        </Field>
      </form.Field>
    </FieldGroup>
    <form.Subscribe v-slot="state">
      <Button type="submit" :disabled="disabled || !state.isDirty || state.isSubmitting">
        <Spinner v-if="state.isSubmitting" />{{ $t('workspace.settings.general.save') }}
      </Button>
    </form.Subscribe>
  </form>
</template>
