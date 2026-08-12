<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'

const props = defineProps<{ token: string }>()
const { t } = useI18n()
const form = useForm({
  defaultValues: { newPassword: '' },
  onSubmit: async ({ value }) => {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: { token: props.token, ...value },
    })
    toast.success(t('reset.complete'))
    await navigateTo('/login')
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <form.Field v-slot="{ field }" name="newPassword">
      <Field>
        <FieldLabel for="reset-new-password">
          {{ $t('reset.new_password') }}
        </FieldLabel>
        <Input id="reset-new-password" type="password" minlength="12" required autocomplete="new-password" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
      </Field>
    </form.Field>
    <Button class="w-full" type="submit">
      {{ $t('reset.submit') }}
    </Button>
  </form>
</template>
