<script setup lang="ts">
import type { AdminDomainSummary } from '@/types'
import { useForm } from '@tanstack/vue-form'

const props = defineProps<{ domain: AdminDomainSummary }>()
const emit = defineEmits<{ saved: [] }>()
const form = useForm({
  defaultValues: { status: props.domain.status === 'active' ? 'disabled' as const : 'active' as const },
  onSubmit: async ({ value }) => {
    await useAPI(`/api/admin/domains/${encodeURIComponent(props.domain.id)}`, { method: 'PATCH', body: value })
    emit('saved')
  },
})
</script>

<template>
  <form class="w-full space-y-6" @submit.prevent="form.handleSubmit">
    <p>{{ domain.status === 'active' ? $t('admin.domains.disable_description') : $t('admin.domains.enable_description') }}</p>
    <Button type="submit" :variant="domain.status === 'active' ? 'destructive' : 'default'">
      {{ domain.status === 'active' ? $t('admin.domains.disable') : $t('admin.domains.enable') }}
    </Button>
  </form>
</template>
