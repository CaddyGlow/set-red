<script setup lang="ts">
import type { Role } from '#shared/auth/permissions'
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ workspaceId: string }>()
const emit = defineEmits<{ invited: [] }>()
const form = useForm({
  defaultValues: { email: '', role: 'member' as Exclude<Role, 'owner'> },
  onSubmit: async ({ value }) => {
    await useAPI(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/invitations`, { method: 'POST', body: value })
    emit('invited')
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <FieldGroup>
      <form.Field v-slot="{ field }" name="email">
        <Field>
          <FieldLabel for="invite-email">
            {{ $t('workspace.members.email') }}
          </FieldLabel>
          <Input id="invite-email" type="email" required :model-value="field.state.value" @input="field.handleChange(($event.target as HTMLInputElement).value)" />
        </Field>
      </form.Field>
      <form.Field v-slot="{ field }" name="role">
        <Field>
          <FieldLabel for="invite-role">
            {{ $t('workspace.members.role') }}
          </FieldLabel>
          <NativeSelect id="invite-role" :model-value="field.state.value" @update:model-value="field.handleChange($event === 'admin' ? 'admin' : $event === 'viewer' ? 'viewer' : 'member')">
            <NativeSelectOption v-for="role in ['admin', 'member', 'viewer']" :key="role" :value="role">
              {{ role }}
            </NativeSelectOption>
          </NativeSelect>
        </Field>
      </form.Field>
    </FieldGroup>
    <Button type="submit">
      {{ $t('workspace.members.send_invite') }}
    </Button>
  </form>
</template>
