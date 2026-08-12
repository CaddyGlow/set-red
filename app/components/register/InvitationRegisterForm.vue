<script setup lang="ts">
import { Loader2 } from '@lucide/vue'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'

const props = defineProps<{ invitationId: string }>()
const emit = defineEmits<{ registered: [] }>()
const error = shallowRef('')
const schema = z.object({
  name: z.string().trim().min(1),
  password: z.string().min(12),
})
const validate = <K extends keyof z.infer<typeof schema>>(key: K) => makeZodValidator(schema.shape[key])
const form = useForm({
  defaultValues: { name: '', password: '' },
  onSubmit: async ({ value }) => {
    error.value = ''
    try {
      await $fetch('/api/auth/invitation-sign-up', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: { ...value, invitationId: props.invitationId },
      })
      emit('registered')
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  },
})
const isSubmitting = form.useStore(state => state.isSubmitting)
</script>

<template>
  <form class="space-y-6" :aria-busy="isSubmitting" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="name" :validators="{ onSubmit: validate('name') }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="invitation-register-name">
            {{ $t('register.name') }}
          </FieldLabel>
          <Input
            id="invitation-register-name"
            autocomplete="name"
            :model-value="field.state.value"
            :disabled="isSubmitting"
            @input="field.handleChange(($event.target as HTMLInputElement).value)"
          />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="password" :validators="{ onSubmit: validate('password') }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="invitation-register-password">
            {{ $t('login.password_label') }}
          </FieldLabel>
          <Input
            id="invitation-register-password"
            type="password"
            autocomplete="new-password"
            :model-value="field.state.value"
            :disabled="isSubmitting"
            @input="field.handleChange(($event.target as HTMLInputElement).value)"
          />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
    </FieldGroup>
    <Alert v-if="error" variant="destructive" role="alert">
      <AlertTitle>{{ error }}</AlertTitle>
    </Alert>
    <Button type="submit" class="w-full" :disabled="isSubmitting">
      <Loader2
        v-if="isSubmitting" aria-hidden="true" class="motion-safe:animate-spin"
      />
      {{ $t('invite.register') }}
    </Button>
  </form>
</template>
