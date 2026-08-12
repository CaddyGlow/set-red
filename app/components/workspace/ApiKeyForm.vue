<script setup lang="ts">
import type { Permission } from '#shared/auth/permissions'
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ permissions: readonly Permission[] }>()
const emit = defineEmits<{ created: [result: { id: string, key: string, name: string }] }>()
const form = useForm({
  defaultValues: {
    name: '',
    permissions: [...props.permissions],
    independentService: false,
  },
  onSubmit: async ({ value }) => {
    const result = await useAPI<{ id: string, key: string, name: string }>('/api/workspaces/api-keys', {
      method: 'POST',
      body: value,
    })
    emit('created', result)
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="name">
        <Field>
          <FieldLabel for="api-key-name">
            {{ $t('workspace.api_keys.name') }}
          </FieldLabel>
          <Input id="api-key-name" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="permissions">
        <Field>
          <FieldLabel>{{ $t('workspace.api_keys.permissions') }}</FieldLabel>
          <div
            class="
              grid gap-2
              sm:grid-cols-2
            "
          >
            <label
              v-for="permission in permissions" :key="permission" class="
                flex items-center gap-2 text-sm
              "
            >
              <Checkbox
                :model-value="field.state.value.includes(permission)"
                @update:model-value="field.handleChange($event ? [...field.state.value, permission] : field.state.value.filter(value => value !== permission))"
              />
              <span>{{ permission }}</span>
            </label>
          </div>
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="independentService">
        <Field orientation="horizontal">
          <FieldLabel for="api-key-service">
            {{ $t('workspace.api_keys.service') }}
          </FieldLabel>
          <Switch id="api-key-service" :model-value="field.state.value" @update:model-value="field.handleChange" />
        </Field>
      </form.Field>
    </FieldGroup>
    <Button type="submit">
      {{ $t('workspace.api_keys.create') }}
    </Button>
  </form>
</template>
