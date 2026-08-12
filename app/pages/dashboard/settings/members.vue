<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
interface Member { id: string, role: string, user: { name: string, email: string } }
interface Invitation { id: string, email: string, role: string, status: string }
const { activeWorkspace, can } = useAuthSession()
const workspaceId = computed(() => activeWorkspace.value?.id ?? '')
const members = ref<Member[]>([])
const invitations = ref<Invitation[]>([])
const inviteOpen = ref(false)

async function refresh() {
  if (!workspaceId.value)
    return
  members.value = await useAPI<Member[]>(`/api/workspaces/${encodeURIComponent(workspaceId.value)}/members`)
  invitations.value = can('members.invite')
    ? await useAPI<Invitation[]>(`/api/workspaces/${encodeURIComponent(workspaceId.value)}/invitations`)
    : []
}

await refresh()

async function changeRole(member: Member, role: string | undefined) {
  if (!role)
    return
  const updated = await useAPI<Member>(`/api/workspaces/${encodeURIComponent(workspaceId.value)}/members/${encodeURIComponent(member.id)}`, { method: 'PATCH', body: { role } })
  member.role = updated.role
}

function handleRemoved(id: string) {
  members.value = members.value.filter(member => member.id !== id)
}

async function handleInvited() {
  inviteOpen.value = false
  await refresh()
}
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        {{ $t('workspace.members.title') }}
      </h1>
      <Button v-if="can('members.invite')" @click="inviteOpen = true">
        {{ $t('workspace.members.invite') }}
      </Button>
    </div>
    <Card>
      <CardContent class="divide-y">
        <div
          v-for="member in members" :key="member.id" class="
            flex items-center justify-between py-4
          "
        >
          <div>
            <p class="font-medium">
              {{ member.user.name }}
            </p><p
              class="text-sm text-muted-foreground"
            >
              {{ member.user.email }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <NativeSelect v-if="can('members.change-role')" :model-value="member.role" @update:model-value="changeRole(member, $event)">
              <NativeSelectOption v-for="role in ['owner', 'admin', 'member', 'viewer']" :key="role" :value="role">
                {{ role }}
              </NativeSelectOption>
            </NativeSelect>
            <Badge v-else variant="secondary">
              {{ member.role }}
            </Badge>
            <WorkspaceMemberRemoveDialog v-if="can('members.remove')" :workspace-id="workspaceId" :member-id="member.id" :name="member.user.name" @removed="handleRemoved" />
          </div>
        </div>
      </CardContent>
    </Card>
    <Card v-if="invitations.length">
      <CardHeader>
        <CardTitle>{{ $t('workspace.members.pending') }}</CardTitle>
      </CardHeader>
      <CardContent class="divide-y">
        <div
          v-for="invitation in invitations" :key="invitation.id" class="
            flex items-center justify-between py-4
          "
        >
          <span>{{ invitation.email }}</span>
          <Badge variant="secondary">
            {{ invitation.role }}
          </Badge>
        </div>
      </CardContent>
    </Card>
    <ResponsiveModal v-model:open="inviteOpen" :title="$t('workspace.members.invite')">
      <WorkspaceInvitationForm v-if="workspaceId" :workspace-id="workspaceId" @invited="handleInvited" />
    </ResponsiveModal>
  </main>
</template>
