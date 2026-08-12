<script setup lang="ts">
import type { WorkspaceSettings } from '#shared/schemas/workspace'
import type { WorkspaceDeletionStatus } from '#shared/types/workspace'
import type { VerifyResponse, WorkspaceSummary } from '@/types'
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'dashboard' })
const { t } = useI18n()
const { activeWorkspace, authMethod, can, role, setAuthSession } = useAuthSession()
const workspace = ref<WorkspaceSummary | null>(activeWorkspace.value)
const settings = ref<WorkspaceSettings | null>(null)
const deletionStatus = ref<WorkspaceDeletionStatus | null>(null)
const deletionStatusError = ref('')
const deletionPreflight = ref({ linkCount: 0, activeDomainCount: 0, canDelete: true })
const canEdit = computed(() => can('workspace.settings'))
const canEditIdentity = computed(() => canEdit.value && (authMethod.value === 'session' || authMethod.value === 'access-user'))
const canManageSecret = computed(() => canEdit.value && (authMethod.value === 'session' || authMethod.value === 'access-user'))
const isOwner = computed(() => role.value === 'owner')

if (workspace.value && can('workspace.delete')) {
  try {
    deletionStatus.value = await useAPI<WorkspaceDeletionStatus>(`/api/workspaces/${encodeURIComponent(workspace.value.id)}/deletion`)
  }
  catch (caught) {
    const code = getAPIStatusCode(caught)
    if (code !== 404)
      deletionStatusError.value = getAPIErrorMessage(caught, t('workspace.settings.errors.status'))
  }
}
if (!deletionStatus.value) {
  settings.value = await useAPI<WorkspaceSettings>('/api/workspaces/settings')
  if (workspace.value && can('workspace.delete'))
    deletionPreflight.value = await useAPI(`/api/workspaces/${encodeURIComponent(workspace.value.id)}/deletion/preflight`)
}

function updateWorkspace(updated: WorkspaceSummary) {
  workspace.value = { ...workspace.value!, ...updated }
}

function updateDefaults(updated: Pick<WorkspaceSettings, 'defaultSlugLength' | 'caseSensitive' | 'redirectStatusCode'>) {
  if (settings.value)
    settings.value = { ...settings.value, ...updated }
}

async function transferred() {
  const response = await useAPI<VerifyResponse>('/api/verify')
  setAuthSession(response)
  toast.success(t('workspace.settings.ownership.transferred'))
}

function deletionRequested(status: WorkspaceDeletionStatus) {
  deletionStatus.value = status
}
</script>

<template>
  <main v-if="workspace" class="mx-auto max-w-3xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ $t('workspace.settings.title') }}
      </h1><p
        class="mt-1 text-sm text-muted-foreground"
      >
        {{ $t('workspace.settings.description') }}
      </p>
    </div>

    <WorkspaceWorkspaceDeletionStatus v-if="deletionStatus" :workspace-id="workspace.id" :initial-status="deletionStatus" />
    <Alert v-else-if="deletionStatusError" variant="destructive">
      <AlertTitle>{{ deletionStatusError }}</AlertTitle>
    </Alert>

    <Alert v-if="!canEdit && !deletionStatus">
      <AlertTitle>{{ $t('workspace.settings.read_only_title') }}</AlertTitle><AlertDescription>{{ $t('workspace.settings.read_only_description') }}</AlertDescription>
    </Alert>

    <Card v-if="settings && !deletionStatus">
      <CardHeader><CardTitle>{{ $t('workspace.settings.general.title') }}</CardTitle><CardDescription>{{ $t('workspace.settings.general.description') }}</CardDescription></CardHeader>
      <CardContent><WorkspaceWorkspaceIdentityForm :workspace="workspace" :disabled="!canEditIdentity || !!deletionStatus" @updated="updateWorkspace" /></CardContent>
    </Card>

    <Card v-if="settings && !deletionStatus">
      <CardHeader><CardTitle>{{ $t('workspace.settings.defaults.title') }}</CardTitle><CardDescription>{{ $t('workspace.settings.defaults.description') }}</CardDescription></CardHeader>
      <CardContent><WorkspaceWorkspaceSettingsForm :settings="settings" :disabled="!canEdit || !!deletionStatus" @updated="updateDefaults" /></CardContent>
    </Card>

    <Card v-if="settings && !deletionStatus">
      <CardHeader><CardTitle>{{ $t('workspace.settings.webhooks.title') }}</CardTitle><CardDescription>{{ $t('workspace.settings.webhooks.description') }}</CardDescription></CardHeader>
      <CardContent><WorkspaceWorkspaceWebhookForm :webhook-url="settings.webhookUrl" :secret-configured="settings.webhookSecretConfigured" :disabled="!canEdit || !!deletionStatus" :can-manage-secret="canManageSecret" @updated="settings.webhookUrl = $event" @secret-configured="settings.webhookSecretConfigured = $event" /></CardContent>
    </Card>

    <Card v-if="isOwner && !deletionStatus">
      <CardHeader><CardTitle>{{ $t('workspace.settings.danger.title') }}</CardTitle><CardDescription>{{ $t('workspace.settings.danger.description') }}</CardDescription></CardHeader>
      <CardContent class="space-y-6">
        <div
          v-if="can('workspace.transfer')" class="
            flex flex-col items-start justify-between gap-4
            sm:flex-row sm:items-center
          "
        >
          <div>
            <p
              class="font-medium"
            >
              {{ $t('workspace.settings.ownership.title') }}
            </p><p
              class="text-sm text-muted-foreground"
            >
              {{ $t('workspace.settings.ownership.summary') }}
            </p>
          </div><WorkspaceWorkspaceOwnershipTransferDialog :workspace-id="workspace.id" @transferred="transferred" />
        </div>
        <Separator />
        <div
          class="
            flex flex-col items-start justify-between gap-4
            sm:flex-row sm:items-center
          "
        >
          <div>
            <p
              class="font-medium"
            >
              {{ $t('workspace.settings.deletion.title') }}
            </p><p
              class="text-sm text-muted-foreground"
            >
              {{ $t('workspace.settings.deletion.summary') }}
            </p><p
              class="mt-1 text-sm text-muted-foreground"
            >
              {{ $t('workspace.settings.deletion.dependencies_description', { links: deletionPreflight.linkCount, domains: deletionPreflight.activeDomainCount }) }}
            </p><div
              class="mt-2 flex gap-3 text-sm"
            >
              <NuxtLink
                class="underline underline-offset-4" to="/dashboard/links"
              >
                {{ $t('workspace.settings.deletion.manage_links') }}
              </NuxtLink><NuxtLink
                class="underline underline-offset-4" to="/dashboard/settings/domains"
              >
                {{ $t('workspace.settings.deletion.manage_domains') }}
              </NuxtLink>
            </div>
          </div><WorkspaceWorkspaceDeleteDialog v-if="can('workspace.delete')" :workspace="workspace" :preflight="deletionPreflight" :disabled="!!deletionStatus" @requested="deletionRequested" />
        </div>
      </CardContent>
    </Card>
  </main>
</template>
