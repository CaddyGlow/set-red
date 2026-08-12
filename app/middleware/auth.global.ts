import type { VerifyResponse } from '@/types'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server)
    return

  const isDashboard = to.path.startsWith('/dashboard')
  const isAuthPage = ['/login', '/register'].includes(to.path)
  if (!isDashboard && !isAuthPage)
    return

  const { setAuthSession, clearAuthSession } = useAuthSession()

  try {
    const response = await useAPI<VerifyResponse>('/api/verify')
    setAuthSession(response)

    if (to.path === '/login')
      return navigateTo('/dashboard')

    if (isDashboard && !response.auth.workspaceId && to.path !== '/dashboard/workspaces')
      return navigateTo('/dashboard/workspaces')
  }
  catch {
    clearAuthSession()
    if (isDashboard)
      return navigateTo('/login')
  }
})
