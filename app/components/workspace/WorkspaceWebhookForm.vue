<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

const props = defineProps<{ webhookUrl: string | null, secretConfigured: boolean, disabled?: boolean, canManageSecret?: boolean }>()
const emit = defineEmits<{ updated: [url: string | null], secretConfigured: [configured: boolean] }>()
const { t } = useI18n()
const error = ref('')
const fieldError = ref('')
const rotating = ref(false)
const revealedSecret = ref<string | null>(null)
const copied = ref(false)
const form = useForm({
  defaultValues: { webhookUrl: props.webhookUrl ?? '' },
  onSubmit: async ({ value, formApi }) => {
    error.value = ''
    fieldError.value = ''
    const webhookUrl = value.webhookUrl.trim() || null
    fieldError.value = validateWorkspaceSettings({ webhookUrl }).webhookUrl ?? ''
    if (fieldError.value)
      return
    try {
      await useAPI('/api/workspaces/settings', { method: 'PUT', body: { webhookUrl } })
      formApi.reset({ webhookUrl: webhookUrl ?? '' })
      emit('updated', webhookUrl)
      toast.success(t('workspace.settings.webhooks.saved'))
    }
    catch (caught) {
      error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.save'))
    }
  },
})

async function rotate() {
  rotating.value = true
  error.value = ''
  try {
    const result = await useAPI<{ secret: string, webhookSecretConfigured: true }>('/api/workspaces/settings/webhook-secret/rotate', { method: 'POST' })
    revealedSecret.value = result.secret
    copied.value = false
    emit('secretConfigured', true)
  }
  catch (caught) {
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.secret'))
  }
  finally {
    rotating.value = false
  }
}

async function copySecret() {
  if (!revealedSecret.value)
    return
  await navigator.clipboard.writeText(revealedSecret.value)
  copied.value = true
}

function dismissSecret() {
  revealedSecret.value = null
  copied.value = false
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-6" @submit.prevent="form.handleSubmit">
      <Alert v-if="error" variant="destructive" role="alert">
        <AlertTitle>{{ error }}</AlertTitle>
      </Alert>
      <form.Field v-slot="{ field }" name="webhookUrl">
        <Field :data-invalid="!!fieldError || undefined">
          <FieldLabel for="workspace-webhook-url">
            {{ $t('workspace.settings.webhooks.url') }}
          </FieldLabel><Input id="workspace-webhook-url" type="url" inputmode="url" maxlength="2048" placeholder="https://example.com/hooks/sink" :aria-invalid="!!fieldError" :disabled="disabled" :model-value="field.state.value" @input="fieldError = ''; field.handleChange(($event.target as HTMLInputElement).value)" /><FieldDescription>{{ $t('workspace.settings.webhooks.url_description') }}</FieldDescription><FieldError v-if="fieldError">
            {{ fieldError }}
          </FieldError>
        </Field>
      </form.Field>
      <form.Subscribe v-slot="state">
        <Button type="submit" :disabled="disabled || !state.isDirty || state.isSubmitting">
          <Spinner v-if="state.isSubmitting" />{{ $t('workspace.settings.webhooks.save') }}
        </Button>
      </form.Subscribe>
    </form>

    <Separator />
    <div class="space-y-3">
      <div>
        <p class="text-sm font-medium">
          {{ $t('workspace.settings.webhooks.secret') }}
        </p><p
          class="text-sm text-muted-foreground"
        >
          {{ secretConfigured ? $t('workspace.settings.webhooks.configured') : $t('workspace.settings.webhooks.not_configured') }}
        </p>
      </div>
      <Alert v-if="revealedSecret">
        <AlertTitle>{{ $t('workspace.settings.webhooks.secret_once') }}</AlertTitle><AlertDescription
          class="space-y-3"
        >
          <code
            class="block break-all select-all"
          >{{ revealedSecret }}</code><div
            class="flex flex-wrap gap-2"
          >
            <Button type="button" size="sm" variant="outline" @click="copySecret">
              <Check v-if="copied" /><Copy v-else />{{ copied ? $t('workspace.settings.webhooks.copied') : $t('workspace.settings.webhooks.copy') }}
            </Button><Button type="button" size="sm" variant="secondary" @click="dismissSecret">
              {{ $t('workspace.settings.webhooks.dismiss') }}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
      <div v-if="canManageSecret" class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" :disabled="disabled || rotating" @click="rotate">
          <Spinner v-if="rotating" />{{ secretConfigured ? $t('workspace.settings.webhooks.rotate') : $t('workspace.settings.webhooks.create_secret') }}
        </Button><WorkspaceWebhookSecretRemoveDialog v-if="secretConfigured" :disabled="disabled" @removed="emit('secretConfigured', false)" />
      </div>
      <p v-else class="text-sm text-muted-foreground">
        {{ $t('workspace.settings.webhooks.interactive_required') }}
      </p>
    </div>
  </div>
</template>
