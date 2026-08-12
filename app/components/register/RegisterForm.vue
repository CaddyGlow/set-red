<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'

const error = shallowRef('')
const schema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(12),
})
const validate = <K extends keyof z.infer<typeof schema>>(key: K) => makeZodValidator(schema.shape[key])
const form = useForm({
  defaultValues: { name: '', email: '', password: '' },
  onSubmit: async ({ value }) => {
    error.value = ''
    try {
      await $fetch('/api/auth/sign-up/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: value,
      })
      await navigateTo('/login')
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="name" :validators="{ onSubmit: validate('name') }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="register-name">
            {{ $t('register.name') }}
          </FieldLabel>
          <Input id="register-name" autocomplete="name" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="email" :validators="{ onSubmit: validate('email') }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="register-email">
            {{ $t('login.email_label') }}
          </FieldLabel>
          <Input id="register-email" type="email" autocomplete="email" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="password" :validators="{ onSubmit: validate('password') }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="register-password">
            {{ $t('login.password_label') }}
          </FieldLabel>
          <Input id="register-password" type="password" autocomplete="new-password" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
    </FieldGroup>
    <Alert v-if="error" variant="destructive">
      <AlertTitle>{{ error }}</AlertTitle>
    </Alert>
    <Button type="submit" class="w-full">
      {{ $t('register.submit') }}
    </Button>
  </form>
</template>
