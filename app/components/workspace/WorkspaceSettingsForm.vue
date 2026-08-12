<script setup lang="ts">
import type { WorkspaceSettings } from '#shared/schemas/workspace'
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

const props = defineProps<{ settings: WorkspaceSettings }>()
const { t } = useI18n()
const form = useForm({
  defaultValues: props.settings,
  onSubmit: async ({ value }) => {
    await useAPI('/api/workspaces/settings', { method: 'PUT', body: value })
    toast.success(t('workspace.settings.saved'))
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="webhookUrl">
        <Field>
          <FieldLabel for="workspace-webhook-url">
            {{ $t('workspace.settings.webhook_url') }}
          </FieldLabel>
          <Input id="workspace-webhook-url" type="url" :model-value="field.state.value ?? ''" @input="field.handleChange(($event.target as HTMLInputElement).value || null)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="webhookSecret">
        <Field>
          <FieldLabel for="workspace-webhook-secret">
            {{ $t('workspace.settings.webhook_secret') }}
          </FieldLabel>
          <Input id="workspace-webhook-secret" type="password" :model-value="field.state.value ?? ''" @input="field.handleChange(($event.target as HTMLInputElement).value || null)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="defaultSlugLength">
        <Field>
          <FieldLabel for="workspace-slug-length">
            {{ $t('workspace.settings.slug_length') }}
          </FieldLabel>
          <Input id="workspace-slug-length" type="number" min="3" max="32" :model-value="field.state.value" @input="field.handleChange(Number(($event.target as HTMLInputElement).value))" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="redirectStatusCode">
        <Field>
          <FieldLabel for="workspace-redirect-status">
            {{ $t('workspace.settings.redirect_status') }}
          </FieldLabel>
          <NativeSelect id="workspace-redirect-status" :model-value="String(field.state.value)" @update:model-value="field.handleChange(Number($event) as 301 | 302 | 307 | 308)">
            <NativeSelectOption v-for="status in [301, 302, 307, 308]" :key="status" :value="String(status)">
              {{ status }}
            </NativeSelectOption>
          </NativeSelect>
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="caseSensitive">
        <Field orientation="horizontal">
          <FieldLabel for="workspace-case-sensitive">
            {{ $t('workspace.settings.case_sensitive') }}
          </FieldLabel>
          <Switch id="workspace-case-sensitive" :model-value="field.state.value" @update:model-value="field.handleChange" />
        </Field>
      </form.Field>
    </FieldGroup>
    <Button type="submit">
      {{ $t('workspace.settings.save') }}
    </Button>
  </form>
</template>
