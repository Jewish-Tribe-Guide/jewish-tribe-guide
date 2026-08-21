import type { CategoryField } from './categories'
import type { DirectoryResource, ResourceSubmission } from '@/types'

// Trim/stringify normalization shared with submissionStore.ts's own
// normalizeForCompare (used there for Google-sync field ownership) — same
// idea, kept as a separate copy since that one lives in a server-only module
// and this needs to run client-side too (see ListingForm.tsx).
function normalize(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

/**
 * Whether an edit submission actually proposes any real change to the
 * listing, versus `existing` — name/address/phone plus every one of the
 * category's own detail fields. Deliberately does NOT look at submitter
 * contact info at all (it's never part of `proposed` — see ListingForm.tsx,
 * where `submittedBy` is built and sent separately from the listing
 * payload), so filling in just a name/email while touching nothing else
 * correctly reads as "no change." Likewise a field edited and then edited
 * right back to its original value compares equal here, since this checks
 * final submitted values against what's stored, not whether a field was
 * touched along the way.
 *
 * `existing` missing (a brand-new listing, or a stale/failed fetch on
 * update) always counts as a change — there's nothing to compare against,
 * and refusing to submit in that case would be a confusing false block, not
 * a safeguard.
 */
export function hasListingChanged(
  existing: DirectoryResource | null | undefined,
  proposed: Pick<ResourceSubmission, 'name' | 'address' | 'phone' | 'details'>,
  fields: CategoryField[],
): boolean {
  if (!existing) return true

  if (normalize(proposed.name) !== normalize(existing.name)) return true
  if (normalize(proposed.address) !== normalize(existing.address)) return true
  if (normalize(proposed.phone) !== normalize(existing.phone)) return true

  for (const field of fields) {
    if (normalize(proposed.details?.[field.key]) !== normalize(existing[field.key])) return true
    if (field.type === 'tags') {
      const sometimesKey = `${field.key}_sometimes`
      if (normalize(proposed.details?.[sometimesKey]) !== normalize(existing[sometimesKey])) return true
    }
  }

  return false
}
