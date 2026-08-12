<script setup lang="ts">
import type { WorkspaceDeletionStatus } from '#shared/types/workspace'

const props = defineProps<{ workspaceId: string, initialStatus: WorkspaceDeletionStatus }>()
const status = ref(props.initialStatus)
const retrying = ref(false)
const error = ref('')
const { t } = useI18n()
const { authMethod, workspaces, setActiveWorkspace, removeWorkspaceFromSession } = useAuthSession()
let timer: ReturnType<typeof setTimeout> | undefined
const lifecycle = createRequestLifecycle()

async function complete() {
  lifecycle.stop()
  if (timer)
    clearTimeout(timer)
  const nextWorkspace = workspaces.value.find(workspace => workspace.id !== props.workspaceId)
  removeWorkspaceFromSession(props.workspaceId)
  if (nextWorkspace) {
    try {
      await setActiveWorkspace(nextWorkspace.id)
      await navigateTo('/dashboard/links')
      return
    }
    catch {
      // The deleted workspace is already removed locally; fall back to selection.
    }
  }
  if (authMethod.value === 'session') {
    try {
      await useAPI('/api/auth/organization/set-active', {
        method: 'POST',
        body: { organizationId: null },
      })
    }
    catch {
      // Local state is authoritative for navigation after confirmed deletion.
    }
  }
  await navigateTo('/dashboard/workspaces')
}

async function poll() {
  if (!lifecycle.canContinue())
    return
  if (document.visibilityState !== 'visible') {
    schedule()
    return
  }
  const controller = lifecycle.begin()
  try {
    const next = await useAPI<WorkspaceDeletionStatus>(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/deletion`, { signal: controller.signal })
    if (!lifecycle.canContinue(controller))
      return
    if (next.state === 'complete') {
      await complete()
      return
    }
    status.value = next
    error.value = ''
  }
  catch (caught) {
    if (!lifecycle.canContinue(controller))
      return
    if (getAPIStatusCode(caught) === 404) {
      await complete()
      return
    }
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.status'))
  }
  schedule()
}

function schedule() {
  if (!lifecycle.canContinue())
    return
  if (timer)
    clearTimeout(timer)
  if (document.visibilityState !== 'visible')
    return
  timer = setTimeout(() => void poll(), 5000)
}

async function retry() {
  if (timer)
    clearTimeout(timer)
  const controller = lifecycle.begin()
  retrying.value = true
  error.value = ''
  try {
    const next = await useAPI<WorkspaceDeletionStatus>(`/api/workspaces/${encodeURIComponent(props.workspaceId)}/deletion/retry`, { method: 'POST', signal: controller.signal })
    if (!lifecycle.canContinue(controller))
      return
    if (next.state === 'complete') {
      await complete()
      return
    }
    status.value = next
  }
  catch (caught) {
    if (!lifecycle.canContinue(controller))
      return
    error.value = getAPIErrorMessage(caught, t('workspace.settings.errors.retry'))
  }
  finally {
    if (lifecycle.canContinue(controller)) {
      retrying.value = false
      schedule()
    }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void poll()
  }
  else {
    if (timer)
      clearTimeout(timer)
    lifecycle.abort()
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  schedule()
})
onBeforeUnmount(() => {
  lifecycle.stop()
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
