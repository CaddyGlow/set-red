<script setup lang="ts">
interface Member { id: string, role: string, user: { name: string, email: string } }
const props = defineProps<{ workspaceId: string }>()
const emit = defineEmits<{ transferred: [] }>()
const open = ref(false)
const loading = ref(false)
const members = ref<Member[]>([])
const error = ref('')
const { t } = useI18n()

async function loadMembers(value: boolean) {
  if (!value)
    return
  loading.value = true
  error.value = ''
  try {
    const all = await useAPI<Member[]>(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/members`)
    members.value = all.filter(member => member.role !== 'owner')
  }
  catch (caught) {
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.members'))
  }
  finally {
    loading.value = false
  }
}

function transferred() {
  open.value = false
  emit('transferred')
}
</script>

<template>
  <div>
    <Button type="button" variant="outline" @click="open = true">
      {{ $t('workspace.settings.ownership.action') }}
    </Button>
    <ResponsiveModal v-model:open="open" :title="$t('workspace.settings.ownership.title')" @update:open="loadMembers">
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">
          {{ $t('workspace.settings.ownership.description') }}
        </p><Spinner v-if="loading" /><Alert v-else-if="error" variant="destructive">
          <AlertTitle>{{ error }}</AlertTitle>
        </Alert><Alert v-else-if="!members.length">
          <AlertTitle>{{ $t('workspace.settings.ownership.no_eligible') }}</AlertTitle>
        </Alert><WorkspaceWorkspaceOwnershipTransferForm v-else :workspace-id="workspaceId" :members="members" @transferred="transferred" />
      </div>
    </ResponsiveModal>
  </div>
</template>
