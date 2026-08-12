import type { WorkspaceSettingsUpdate } from '../../shared/schemas/workspace'
import { WorkspaceCreateSchema, WorkspaceSettingsUpdateSchema } from '../../shared/schemas/workspace'

export function changedWorkspaceValues<T extends object>(initial: T, current: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => !Object.is(value, initial[key as keyof T])),
  ) as Partial<T>
}

function fieldErrors(result: ReturnType<typeof WorkspaceCreateSchema.safeParse>): Record<string, string> {
  if (result.success)
    return {}
  return Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0] ?? ''), issue.message]))
}

export function validateWorkspaceIdentity(value: { name: string, slug: string }): Record<string, string> {
  return fieldErrors(WorkspaceCreateSchema.safeParse(value))
}

export function validateWorkspaceSettings(value: WorkspaceSettingsUpdate): Record<string, string> {
  const result = WorkspaceSettingsUpdateSchema.safeParse(value)
  if (result.success)
    return {}
  return Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0] ?? 'form'), issue.message]))
}

export function getIncompatibleLinkCount(error: unknown): number | null {
  if (typeof error !== 'object' || error === null)
    return null
  const data = 'data' in error && typeof error.data === 'object' && error.data !== null ? error.data : null
  const nested = data && 'data' in data && typeof data.data === 'object' && data.data !== null ? data.data : null
  const value = data && 'incompatibleLinks' in data
    ? data.incompatibleLinks
    : nested && 'incompatibleLinks' in nested
      ? nested.incompatibleLinks
      : null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
