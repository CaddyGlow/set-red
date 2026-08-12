<script setup lang="ts">
import type { Domain } from '#shared/schemas/domain'
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ domain: Domain }>()
const emit = defineEmits<{ saved: [domain: Domain] }>()
const form = useForm({
  defaultValues: {
    status: props.domain.status,
    isPrimary: props.domain.isPrimary,
    notFoundRedirect: props.domain.notFoundRedirect ?? '',
    homeUrl: props.domain.homeUrl ?? '',
  },
  onSubmit: async ({ value }) => {
    const domain = await useAPI<Domain>(`/api/domains/${encodeURIComponent(props.domain.id)}`, {
      method: 'PATCH',
      body: {
        id: props.domain.id,
        ...value,
        notFoundRedirect: value.notFoundRedirect || null,
        homeUrl: value.homeUrl || null,
      },
    })
    emit('saved', domain)
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="status">
        <Field>
          <FieldLabel for="domain-status">
            {{ $t('workspace.domains.status') }}
          </FieldLabel>
          <NativeSelect id="domain-status" :model-value="field.state.value" @update:model-value="field.handleChange($event === 'disabled' ? 'disabled' : 'active')">
            <NativeSelectOption value="active">
              {{ $t('workspace.domains.active') }}
            </NativeSelectOption>
            <NativeSelectOption value="disabled">
              {{ $t('workspace.domains.disabled') }}
            </NativeSelectOption>
          </NativeSelect>
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="homeUrl">
        <Field>
          <FieldLabel for="domain-home-url">
            {{ $t('workspace.domains.home_url') }}
          </FieldLabel>
          <Input id="domain-home-url" type="url" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="notFoundRedirect">
        <Field>
          <FieldLabel for="domain-not-found">
            {{ $t('workspace.domains.not_found_redirect') }}
          </FieldLabel>
          <Input id="domain-not-found" type="url" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="isPrimary">
        <Field orientation="horizontal">
          <FieldLabel for="domain-primary">
            {{ $t('workspace.domains.primary') }}
          </FieldLabel>
          <Switch id="domain-primary" :model-value="field.state.value" @update:model-value="field.handleChange" />
        </Field>
      </form.Field>
    </FieldGroup>
    <Button type="submit">
      {{ $t('workspace.domains.save') }}
    </Button>
  </form>
</template>
