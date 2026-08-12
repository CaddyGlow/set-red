export interface AdminPage<T> {
  items: T[]
  nextCursor: string | null
}

export interface AdminOverview {
  users: number
  verifiedUsers: number
  instanceAdmins: number
  workspaces: number
  activeDomains: number
  disabledDomains: number
  links: number
  pendingInvitations: number
  userApiKeys: number
  serviceApiKeys: number
}

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  emailVerified: boolean
  isInstanceAdmin: boolean
  createdAt: string
  providers: string[]
  workspaceCount: number
  lastSessionAt: string | null
}

export interface AdminWorkspaceSummary {
  id: string
  name: string
  slug: string
  createdAt: string
  memberCount: number
  ownerCount: number
  domainCount: number
  linkCount: number
  apiKeyCount: number
  deletionState: 'pending' | 'purging' | null
}

export interface AdminDomainSummary {
  id: string
  workspaceId: string
  workspaceName: string
  hostname: string
  status: 'active' | 'disabled'
  isPrimary: boolean
  createdAt: number
}

export interface AdminAuditSummary {
  id: string
  workspaceRef: string | null
  actorType: string
  actorId: string
  action: string
  targetType: string
  targetId: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
}
