<script setup lang="ts">
import { AlertCircle, Loader2 } from '@lucide/vue'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'

const { t } = useI18n()
const route = useRoute()
const submitError = shallowRef('')

const redirectPath = computed(() => {
  const requested = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
})

const emailValidator = z.string().trim().email()
const passwordValidator = z.string().min(8)
const validateEmail = makeZodValidator(emailValidator)
const validatePassword = makeZodValidator(passwordValidator)

const form = useForm({
  defaultValues: { email: '', password: '' },
  onSubmit: async ({ value }) => {
    submitError.value = ''
    try {
      await $fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: value,
      })
      await navigateTo(redirectPath.value)
    }
    catch (error) {
      console.error(error)
      submitError.value = t('login.failed')
    }
  },
})
const isSubmitting = form.useStore(state => state.isSubmitting)
</script>

<template>
  <form class="space-y-6" :aria-busy="isSubmitting" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field
        v-slot="{ field }"
        name="email"
        :validators="{ onBlur: validateEmail, onSubmit: validateEmail }"
      >
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="login-email">
            {{ $t('login.email_label') }}
          </FieldLabel>
          <Input
            id="login-email"
            type="email"
            name="email"
            autocomplete="email"
            :model-value="field.state.value"
            :aria-invalid="getAriaInvalid(field)"
            :disabled="isSubmitting"
            @blur="field.handleBlur"
            @input="field.handleChange(($event.target as HTMLInputElement).value)"
          />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
      <form.Field
        v-slot="{ field }"
        name="password"
        :validators="{ onBlur: validatePassword, onSubmit: validatePassword }"
      >
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="login-password">
            {{ $t('login.password_label') }}
          </FieldLabel>
          <Input
            id="login-password"
            type="password"
            name="password"
            autocomplete="current-password"
            :model-value="field.state.value"
            :aria-invalid="getAriaInvalid(field)"
            :disabled="isSubmitting"
            @blur="field.handleBlur"
            @input="field.handleChange(($event.target as HTMLInputElement).value)"
          />
          <FieldError v-if="isInvalid(field)" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
    </FieldGroup>

    <Alert v-if="submitError" variant="destructive" role="alert">
      <AlertCircle aria-hidden="true" class="size-4" />
      <AlertTitle>{{ submitError }}</AlertTitle>
    </Alert>

    <Button class="w-full" type="submit" :disabled="isSubmitting" :aria-busy="isSubmitting">
      <Loader2
        v-if="isSubmitting" aria-hidden="true" class="motion-safe:animate-spin"
      />
      {{ $t(isSubmitting ? 'login.logging_in' : 'login.submit') }}
    </Button>
    <Button variant="link" class="w-full" as-child>
      <NuxtLink to="/forgot-password">
        {{ $t('reset.forgot') }}
      </NuxtLink>
    </Button>
  </form>
</template>
