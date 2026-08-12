<script setup lang="ts">
import type { WorkspaceSummary } from '@/types'
import { useForm } from '@tanstack/vue-form'

const emit = defineEmits<{ created: [workspace: WorkspaceSummary] }>()
const form = useForm({
  defaultValues: { name: '', slug: '' },
  onSubmit: async ({ value }) => {
    const workspace = await useAPI<WorkspaceSummary>('/api/workspaces', { method: 'POST', body: value })
    emit('created', workspace)
  },
})
</script>

<template>
  <form class="w-full space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="name">
        <Field>
          <FieldLabel for="workspace-create-name">
            {{ $t('workspace.create.name') }}
          </FieldLabel><Input id="workspace-create-name" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field><form.Field v-slot="{ field }" name="slug">
        <Field>
          <FieldLabel for="workspace-create-slug">
            {{ $t('workspace.create.slug') }}
          </FieldLabel><Input id="workspace-create-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
    </FieldGroup><Button type="submit">
      {{ $t('workspace.create.action') }}
    </Button>
  </form>
</template>
