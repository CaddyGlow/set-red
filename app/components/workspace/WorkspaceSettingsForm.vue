<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

interface LinkDefaults {
  defaultSlugLength: number
  caseSensitive: boolean
  redirectStatusCode: 301 | 302 | 307 | 308
}

const props = defineProps<{ settings: LinkDefaults, disabled?: boolean }>()
const emit = defineEmits<{ updated: [settings: LinkDefaults] }>()
const { t } = useI18n()
const error = ref('')
const incompatibleLinks = ref<number | null>(null)
const fieldErrors = ref<Record<string, string>>({})
const initial: LinkDefaults = {
  defaultSlugLength: props.settings.defaultSlugLength,
  caseSensitive: props.settings.caseSensitive,
  redirectStatusCode: props.settings.redirectStatusCode,
}
const form = useForm({
  defaultValues: initial,
  onSubmit: async ({ value, formApi }) => {
    error.value = ''
    incompatibleLinks.value = null
    const body = changedWorkspaceValues(initial, value)
    fieldErrors.value = validateWorkspaceSettings(body)
    if (Object.keys(fieldErrors.value).length || !Object.keys(body).length)
      return
    try {
      const settings = await useAPI<LinkDefaults>('/api/workspaces/settings', { method: 'PUT', body })
      const next = {
        defaultSlugLength: settings.defaultSlugLength,
        caseSensitive: settings.caseSensitive,
        redirectStatusCode: settings.redirectStatusCode,
      }
      Object.assign(initial, next)
      formApi.reset(next)
      emit('updated', next)
      toast.success(t('workspace.settings.defaults.saved'))
    }
    catch (caught) {
      error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.save'))
      incompatibleLinks.value = getIncompatibleLinkCount(caught)
    }
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <Alert v-if="error" variant="destructive" role="alert">
      <AlertTitle>
        {{ error }}<template v-if="incompatibleLinks !== null">
          ({{ incompatibleLinks }})
        </template>
      </AlertTitle>
    </Alert>
    <FieldGroup>
      <form.Field v-slot="{ field }" name="defaultSlugLength">
        <Field :data-invalid="!!fieldErrors.defaultSlugLength || undefined">
          <FieldLabel for="workspace-slug-length">
            {{ $t('workspace.settings.defaults.slug_length') }}
          </FieldLabel><Input id="workspace-slug-length" type="number" min="3" max="32" required :aria-invalid="!!fieldErrors.defaultSlugLength" :disabled="disabled" :model-value="field.state.value" @input="fieldErrors.defaultSlugLength = ''; field.handleChange(Number(($event.target as HTMLInputElement).value))" /><FieldDescription>{{ $t('workspace.settings.defaults.slug_length_description') }}</FieldDescription><FieldError v-if="fieldErrors.defaultSlugLength">
            {{ fieldErrors.defaultSlugLength }}
          </FieldError>
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="redirectStatusCode">
        <Field>
          <FieldLabel for="workspace-redirect-status">
            {{ $t('workspace.settings.defaults.redirect_status') }}
          </FieldLabel><NativeSelect id="workspace-redirect-status" :disabled="disabled" :model-value="String(field.state.value)" @update:model-value="field.handleChange(Number($event) as 301 | 302 | 307 | 308)">
            <NativeSelectOption v-for="status in [301, 302, 307, 308]" :key="status" :value="String(status)">
              {{ status }} — {{ $t(`workspace.settings.defaults.status_${status}`) }}
            </NativeSelectOption>
          </NativeSelect><FieldDescription>{{ $t('workspace.settings.defaults.redirect_description') }}</FieldDescription>
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="caseSensitive">
        <Field orientation="horizontal">
          <div class="space-y-1">
            <FieldLabel for="workspace-case-sensitive">
              {{ $t('workspace.settings.defaults.case_sensitive') }}
            </FieldLabel><FieldDescription>{{ field.state.value ? $t('workspace.settings.defaults.case_sensitive_on') : $t('workspace.settings.defaults.case_sensitive_off') }}</FieldDescription>
          </div><Switch id="workspace-case-sensitive" :disabled="disabled" :model-value="field.state.value" @update:model-value="field.handleChange" />
        </Field>
      </form.Field>
    </FieldGroup>
    <form.Subscribe v-slot="state">
      <Button type="submit" :disabled="disabled || !state.isDirty || state.isSubmitting">
        <Spinner v-if="state.isSubmitting" />{{ $t('workspace.settings.defaults.save') }}
      </Button>
    </form.Subscribe>
  </form>
</template>
