<script setup lang="ts">
import type { WorkspaceDeletionStatus } from '#shared/types/workspace'
import type { VerifyResponse } from '@/types'

const props = defineProps<{ workspaceId: string, initialStatus: WorkspaceDeletionStatus }>()
const status = ref(props.initialStatus)
const retrying = ref(false)
const error = ref('')
const { t } = useI18n()
const { setAuthSession } = useAuthSession()
let timer: ReturnType<typeof setTimeout> | undefined

async function complete() {
  if (timer)
    clearTimeout(timer)
  const response = await useAPI<VerifyResponse>('/api/verify')
  setAuthSession(response)
  await navigateTo(response.auth.workspaceId ? '/dashboard/links' : '/dashboard/workspaces')
}

async function poll() {
  if (document.visibilityState !== 'visible') {
    schedule()
    return
  }
  try {
    const next = await useAPI<WorkspaceDeletionStatus>(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/deletion`)
    if (next.state === 'complete') {
      await complete()
      return
    }
    status.value = next
    error.value = ''
  }
  catch (caught) {
    if (getAPIStatusCode(caught) === 404) {
      await complete()
      return
    }
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.status'))
  }
  schedule()
}

function schedule() {
  if (timer)
    clearTimeout(timer)
  if (document.visibilityState !== 'visible')
    return
  timer = setTimeout(() => void poll(), 5000)
}

async function retry() {
  retrying.value = true
  error.value = ''
  try {
    const next = await useAPI<WorkspaceDeletionStatus>(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/deletion/retry`, { method: 'POST' })
    if (next.state === 'complete') {
      await complete()
      return
    }
    status.value = next
  }
  catch (caught) {
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.retry'))
  }
  finally {
    retrying.value = false
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible')
    void poll()
  else if (timer)
    clearTimeout(timer)
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  schedule()
})
onBeforeUnmount(() => {
  if (timer)
    clearTimeout(timer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <Alert :variant="status.state === 'blocked' ? 'destructive' : 'default'">
    <AlertTitle>{{ $t(`workspace.settings.deletion.status_${status.state}`) }}</AlertTitle>
    <AlertDescription class="space-y-3">
      <p>{{ status.errorCode ? $t(`workspace.settings.deletion.error_${status.errorCode}`) : $t(`workspace.settings.deletion.description_${status.state}`) }}</p><p
        v-if="error" class="text-destructive"
      >
        {{ error }}
      </p><Button v-if="status.state === 'blocked' || status.state === 'purging'" type="button" size="sm" variant="outline" :disabled="retrying" @click="retry">
        <Spinner v-if="retrying" />{{ $t('workspace.settings.deletion.retry') }}
      </Button>
    </AlertDescription>
  </Alert>
</template>
