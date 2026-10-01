import type { DirectoryResource, ResourceSubmission } from '@/types'
import { companionKeys, fieldIsVisible, isCategorySyncEligible, type CategoryConfig } from './categories'

/**
 * An edit suggestion made for someone in one tap: the listing as it stands,
 * with only `changes` different. Built the way the Edit form builds its own
 * (useListingDraft's buildSubmission), so the moderation queue shows exactly
 * that change. A question card's answer ("meat, dairy or parve?") and an
 * item's "Not anymore" both send one.
 */
export function editSubmission(category: CategoryConfig, item: DirectoryResource, changes: Record<string, unknown>): ResourceSubmission {
  const hasAddress = category.hasAddress !== false
  const hasPhone = category.hasPhone !== false
  const details: Record<string, unknown> = {}
  for (const f of category.detailFields) {
    if (f.key in item) details[f.key] = item[f.key]
    for (const k of companionKeys(f)) if (k in item) details[k] = item[k]
  }
  Object.assign(details, changes)
  const visible: Record<string, unknown> = {}
  for (const f of category.detailFields) {
    if (!fieldIsVisible(f, details)) continue
    visible[f.key] = details[f.key]
    if (f.type === 'tags') visible[`${f.key}_sometimes`] = details[`${f.key}_sometimes`] ?? []
    // A shul's special schedules go with its times, unchanged unless edited.
    for (const k of companionKeys(f)) if (f.type !== 'tags' && k in details) visible[k] = details[k]
  }
  const sync = isCategorySyncEligible(category)
  return {
    category: category.id,
    name: item.name,
    anchorId: hasAddress ? 'all' : 'community',
    distance: null,
    address: hasAddress ? (item.address ?? '') : '',
    phone: hasPhone ? (item.phone ?? '') : '',
    details: {
      ...visible,
      ...(sync && typeof item.placeId === 'string' ? { placeId: item.placeId } : {}),
      ...(sync && typeof item.businessStatus === 'string' ? { businessStatus: item.businessStatus } : {}),
    },
    geo: hasAddress ? ((item.geo as { lat: number; lng: number } | undefined) ?? null) : null,
  }
}
