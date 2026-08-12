<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ workspace: { id: string, name: string, slug: string } }>()
const emit = defineEmits<{ saved: [workspace: { id: string, name: string, slug: string }] }>()
const form = useForm({
  defaultValues: { name: props.workspace.name, slug: props.workspace.slug },
  onSubmit: async ({ value }) => {
    const saved = await useAPI<{ id: string, name: string, slug: string }>(`/api/admin/workspaces/${encodeURIComponent(props.workspace.id)}`, { method: 'PATCH', body: value })
    emit('saved', saved)
  },
})
</script>

<template>
  <form class="w-full space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="name">
        <Field>
          <FieldLabel for="admin-workspace-name">
            {{ $t('admin.common.name') }}
          </FieldLabel><Input id="admin-workspace-name" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field><form.Field v-slot="{ field }" name="slug">
        <Field>
          <FieldLabel for="admin-workspace-slug">
            Slug
          </FieldLabel><Input id="admin-workspace-slug" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
    </FieldGroup><Button type="submit">
      {{ $t('admin.common.save') }}
    </Button>
  </form>
</template>
