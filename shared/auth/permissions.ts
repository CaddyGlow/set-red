/**
 * The product authorization model. Keep role capabilities here so server
 * guards, Better Auth, API keys, and UI affordances all use one source.
 */
export const permissionStatement = {
  links: ['read', 'write', 'write:any', 'import', 'export'],
  analytics: ['read'],
  backups: ['manage'],
  domains: ['write', 'provision'],
  members: ['invite', 'remove', 'change-role', 'manage-owner'],
  apiKeys: ['own', 'manage'],
  workspace: ['settings', 'delete', 'transfer'],
} as const

type PermissionResource = keyof typeof permissionStatement
type PermissionAction<R extends PermissionResource> = typeof permissionStatement[R][number]

export type Permission = {
  [R in PermissionResource]: `${R}.${PermissionAction<R>}`
}[PermissionResource]

export const roles = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = typeof roles[number]

const viewerPermissions = [
  'links.read',
  'links.export',
  'analytics.read',
] as const satisfies readonly Permission[]

const memberPermissions = [
  ...viewerPermissions,
  'links.write',
  'apiKeys.own',
] as const satisfies readonly Permission[]

const adminPermissions = [
  ...memberPermissions,
  'links.write:any',
  'links.import',
  'backups.manage',
  'domains.write',
  'members.invite',
  'members.remove',
  'members.change-role',
  'apiKeys.manage',
  'workspace.settings',
] as const satisfies readonly Permission[]

export const rolePermissions = {
  owner: [
    ...adminPermissions,
    'members.manage-owner',
    'workspace.delete',
    'workspace.transfer',
  ],
  admin: adminPermissions,
  member: memberPermissions,
  viewer: viewerPermissions,
} as const satisfies Record<Role, readonly Permission[]>

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && roles.includes(value as Role)
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.entries(permissionStatement).some(
    ([resource, actions]) => actions.some(action => value === `${resource}.${action}`),
  )
}

export function can(role: Role, permission: Permission): boolean {
  return (rolePermissions[role] as readonly Permission[]).includes(permission)
}

export function permissionsForRole(role: Role): Permission[] {
  return [...rolePermissions[role]]
}

export function permissionsToStatement(permissions: readonly Permission[]): Record<string, string[]> {
  const statement: Record<string, string[]> = {}
  for (const permission of permissions) {
    const separator = permission.indexOf('.')
    const resource = permission.slice(0, separator)
    const action = permission.slice(separator + 1)
    ;(statement[resource] ??= []).push(action)
  }
  return statement
}
