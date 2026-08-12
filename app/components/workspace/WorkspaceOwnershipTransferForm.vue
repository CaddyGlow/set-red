<script setup lang="ts">
import type { VerifyResponse } from '@/types'
import { useForm } from '@tanstack/vue-form'

interface Member { id: string, role: string, user: { name: string, email: string } }
const props = defineProps<{ workspaceId: string, members: Member[] }>()
const emit = defineEmits<{ transferred: [] }>()
const { t } = useI18n()
const { setAuthSession } = useAuthSession()
const error = ref('')
const form = useForm({
  defaultValues: { targetMemberId: '' },
  onSubmit: async ({ value }) => {
    error.value = ''
    try {
      await useAPI(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/ownership/transfer`, { method: 'POST', body: value })
      setAuthSession(await useAPI<VerifyResponse>('/api/verify'))
      emit('transferred')
    }
    catch (caught) {
      error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.transfer'))
    }
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="form.handleSubmit">
    <Alert v-if="error" variant="destructive" role="alert">
      <AlertTitle>{{ error }}</AlertTitle>
    </Alert>
    <form.Field v-slot="{ field }" name="targetMemberId">
      <Field>
        <FieldLabel for="workspace-new-owner">
          {{ $t('workspace.settings.ownership.new_owner') }}
        </FieldLabel><NativeSelect id="workspace-new-owner" required :model-value="field.state.value" @update:model-value="field.handleChange($event ?? '')">
          <NativeSelectOption disabled value="">
            {{ $t('workspace.settings.ownership.select_member') }}
          </NativeSelectOption><NativeSelectOption v-for="member in members" :key="member.id" :value="member.id">
            {{ member.user.name }} — {{ member.user.email }}
          </NativeSelectOption>
        </NativeSelect><FieldDescription>{{ $t('workspace.settings.ownership.effect') }}</FieldDescription>
      </Field>
    </form.Field>
    <form.Subscribe v-slot="state">
      <Button type="submit" variant="destructive" :disabled="!state.canSubmit || !state.values.targetMemberId || state.isSubmitting">
        <Spinner v-if="state.isSubmitting" />{{ $t('workspace.settings.ownership.confirm') }}
      </Button>
    </form.Subscribe>
  </form>
</template>
