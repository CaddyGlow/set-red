<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

const { t } = useI18n()
const form = useForm({
  defaultValues: { email: '' },
  onSubmit: async ({ value }) => {
    await $fetch('/api/auth/request-password-reset', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: { ...value, redirectTo: `${location.origin}/reset-password` },
    })
    toast.success(t('reset.requested'))
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <form.Field v-slot="{ field }" name="email">
      <Field>
        <FieldLabel for="reset-request-email">
          {{ $t('login.email_label') }}
        </FieldLabel>
        <Input id="reset-request-email" type="email" required autocomplete="email" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
      </Field>
    </form.Field>
    <Button class="w-full" type="submit">
      {{ $t('reset.request') }}
    </Button>
  </form>
</template>
