import type { Permission, Role } from '../auth/permissions'

export type AuthMethod = 'session' | 'api-key' | 'access-user' | 'access-service'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface AuthContext {
  method: AuthMethod
  user: AuthUser | null
  workspaceId: string | null
  role: Role | null
  permissions: Permission[]
  apiKeyId: string | null
  isInstanceAdmin: boolean
}

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  role: Role
}

export interface VerifyResponse {
  name: string
  url: string
  auth: AuthContext
  workspaces: WorkspaceSummary[]
  accessEnabled: boolean
}
