<script setup lang="ts">
import type { AdminPage, AdminWorkspaceSummary } from '@/types'
import { useForm } from '@tanstack/vue-form'

const emit = defineEmits<{ saved: [] }>()
const workspaces = await useAPI<AdminPage<AdminWorkspaceSummary>>('/api/admin/workspaces', { query: { limit: 100 } })
const form = useForm({
  defaultValues: { id: '', hostname: '', workspaceId: workspaces.items[0]?.id ?? '', status: 'active' as 'active' | 'disabled' },
  onSubmit: async ({ value }) => {
    await useAPI('/api/admin/domains', { method: 'POST', body: { ...value, isPrimary: false } })
    emit('saved')
  },
})
</script>

<template>
  <form class="w-full space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="id">
        <Field>
          <FieldLabel for="admin-domain-id">
            ID
          </FieldLabel><Input id="admin-domain-id" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="hostname">
        <Field>
          <FieldLabel for="admin-domain-host">
            {{ $t('admin.domains.hostname') }}
          </FieldLabel><Input id="admin-domain-host" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="workspaceId">
        <Field>
          <FieldLabel for="admin-domain-workspace">
            {{ $t('admin.workspaces.title') }}
          </FieldLabel><NativeSelect id="admin-domain-workspace" :model-value="field.state.value" @update:model-value="field.handleChange(typeof $event === 'string' ? $event : '')">
            <NativeSelectOption v-for="workspace in workspaces.items" :key="workspace.id" :value="workspace.id">
              {{ workspace.name }}
            </NativeSelectOption>
          </NativeSelect>
        </Field>
      </form.Field>
    </FieldGroup>
    <Button type="submit">
      {{ $t('admin.domains.create') }}
    </Button>
  </form>
</template>
