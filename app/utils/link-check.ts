import type { DashboardQuery } from '@/utils/dashboard-query'
import { parseAnalysisQuery, serializeAnalysisQuery } from '@/utils/dashboard-query'

export function getDashboardLinkDetailLocation(id: string, sourceQuery?: DashboardQuery) {
  return {
    path: '/dashboard/link',
    query: sourceQuery
      ? { ...serializeAnalysisQuery(parseAnalysisQuery(sourceQuery, false), { allowSlugs: false }), id }
      : { id },
  }
}

export function getDashboardLinkDetailUrl(id: string): string {
  return `/dashboard/link?id=${encodeURIComponent(id)}`
}
