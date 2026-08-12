<script setup lang="ts">
import type { AdminDomainSummary, AdminPage, AdminWorkspaceSummary } from '@/types'
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ domain: AdminDomainSummary }>()
const emit = defineEmits<{ saved: [] }>()
const workspaces = await useAPI<AdminPage<AdminWorkspaceSummary>>('/api/admin/workspaces', { query: { limit: 100 } })
const form = useForm({
  defaultValues: { workspaceId: props.domain.workspaceId },
  onSubmit: async ({ value }) => {
    await useAPI(`/api/admin/domains/${encodeURIComponent(props.domain.id)}/assignment`, { method: 'PATCH', body: value })
    emit('saved')
  },
})
</script>

<template>
  <form class="w-full space-y-6" @submit.prevent="form.handleSubmit">
    <form.Field v-slot="{ field }" name="workspaceId">
      <Field>
        <FieldLabel for="admin-domain-assignment">
          {{ $t('admin.workspaces.title') }}
        </FieldLabel><NativeSelect id="admin-domain-assignment" :model-value="field.state.value" @update:model-value="field.handleChange(typeof $event === 'string' ? $event : '')">
          <NativeSelectOption v-for="workspace in workspaces.items" :key="workspace.id" :value="workspace.id">
            {{ workspace.name }}
          </NativeSelectOption>
        </NativeSelect>
      </Field>
    </form.Field><Button type="submit">
      {{ $t('admin.domains.assign') }}
    </Button>
  </form>
</template>
