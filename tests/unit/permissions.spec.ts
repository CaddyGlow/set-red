import type { Permission, Role } from '../../shared/auth/permissions'
import { describe, expect, it } from 'vitest'
import { can, rolePermissions, roles } from '../../shared/auth/permissions'

const expected: Record<Permission, readonly Role[]> = {
  'links.read': roles,
  'links.write': ['owner', 'admin', 'member'],
  'links.write:any': ['owner', 'admin'],
  'links.import': ['owner', 'admin'],
  'links.export': roles,
  'analytics.read': roles,
  'backups.manage': ['owner', 'admin'],
  'domains.write': ['owner', 'admin'],
  'domains.provision': [],
  'members.invite': ['owner', 'admin'],
  'members.remove': ['owner', 'admin'],
  'members.change-role': ['owner', 'admin'],
  'members.manage-owner': ['owner'],
  'apiKeys.own': ['owner', 'admin', 'member'],
  'apiKeys.manage': ['owner', 'admin'],
  'workspace.settings': ['owner', 'admin'],
  'workspace.delete': ['owner'],
  'workspace.transfer': ['owner'],
}

describe('workspace permission matrix', () => {
  for (const [permission, allowedRoles] of Object.entries(expected) as [Permission, readonly Role[]][]) {
    for (const role of roles) {
      it(`${role} ${allowedRoles.includes(role) ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowedRoles.includes(role))
      })
    }
  }

  it('contains no undeclared or duplicate permissions', () => {
    for (const role of roles)
      expect(new Set(rolePermissions[role])).toHaveLength(rolePermissions[role].length)
    expect(new Set(Object.values(rolePermissions).flat())).toEqual(
      new Set(Object.keys(expected).filter(permission => permission !== 'domains.provision')),
    )
  })
})
