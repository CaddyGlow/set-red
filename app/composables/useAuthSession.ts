import type { Permission } from '#shared/auth/permissions'
import type { AuthContext, VerifyResponse, WorkspaceSummary } from '@/types'
import { readonly, useState } from '#imports'

export function useAuthSession() {
  const auth = useState<AuthContext | null>('auth-context', () => null)
  const workspaces = useState<WorkspaceSummary[]>('auth-workspaces', () => [])
  const accessEnabled = useState('access-enabled', () => false)

  const activeWorkspace = computed(() =>
    workspaces.value.find(workspace => workspace.id === auth.value?.workspaceId) ?? null,
  )
  const userID = computed(() => auth.value?.user?.id ?? null)
  const userEmail = computed(() => auth.value?.user?.email ?? null)
  const authMethod = computed(() => auth.value?.method ?? null)
  const role = computed(() => auth.value?.role ?? null)

  function setAuthSession(response: VerifyResponse) {
    auth.value = response.auth
    workspaces.value = response.workspaces
    accessEnabled.value = response.accessEnabled
  }

  function clearAuthSession() {
    auth.value = null
    workspaces.value = []
    accessEnabled.value = false
  }

  function can(permission: Permission): boolean {
    return auth.value?.permissions.includes(permission) ?? false
  }

  async function setActiveWorkspace(workspaceId: string) {
    await useAPI('/api/auth/organization/set-active', {
      method: 'POST',
      body: { organizationId: workspaceId },
    })
    const response = await useAPI<VerifyResponse>('/api/verify')
    setAuthSession(response)
  }

  return {
    auth: readonly(auth),
    authMethod,
    userID,
    userEmail,
    accessEnabled: readonly(accessEnabled),
    workspaces: readonly(workspaces),
    activeWorkspace,
    role,
    can,
    setActiveWorkspace,
    setAuthSession,
    clearAuthSession,
  }
}
