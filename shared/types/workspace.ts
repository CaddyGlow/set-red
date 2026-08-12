export type WorkspaceDeletionState = 'pending' | 'purging' | 'blocked' | 'complete'

export type WorkspaceDeletionErrorCode = 'dependencies-remain' | 'cleanup-failed'

export interface WorkspaceDeletionStatus {
  state: WorkspaceDeletionState
  errorCode: WorkspaceDeletionErrorCode | null
  storageDrainUntil: string | null
  updatedAt: string | null
}

export interface WorkspaceDeletionPreflight {
  linkCount: number
  activeDomainCount: number
  canDelete: boolean
}
