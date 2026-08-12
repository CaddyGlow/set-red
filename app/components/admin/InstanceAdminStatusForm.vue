<script setup lang="ts">
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ user: { id: string, isInstanceAdmin: boolean } }>()
const emit = defineEmits<{ saved: [enabled: boolean] }>()
const form = useForm({
  defaultValues: { enabled: !props.user.isInstanceAdmin },
  onSubmit: async ({ value }) => {
    await useAPI(`/api/admin/users/${encodeURIComponent(props.user.id)}/instance-admin`, { method: 'PATCH', body: value })
    emit('saved', value.enabled)
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <p>{{ user.isInstanceAdmin ? $t('admin.users.revoke_description') : $t('admin.users.grant_description') }}</p><Button type="submit" :variant="user.isInstanceAdmin ? 'destructive' : 'default'">
      {{ user.isInstanceAdmin ? $t('admin.users.revoke') : $t('admin.users.grant') }}
    </Button>
  </form>
</template>
