import { getAdminClient } from '@/lib/supabase/admin'
import { fetchPlaceSync, nextGoogleFields, syncMayWrite, type OwnableSyncField } from '@/lib/googlePlaces'
import { submitGoogleClosure } from '@/lib/submissionStore'
import { sendSubmissionNotification, type StatusChange } from '@/lib/email'
import { listCategories } from '@/lib/categoryStore'
import type { CategoryConfig } from '@/lib/categories'

// ─────────────────────────────────────────────────────────────────────────────
// Syncing ONE listing against Google Places.
//
// Extracted from the nightly cron's loop so the same code — the same field
// ownership rules, the same closure routing, the same transition recording —
// can also run the moment a listing is approved, and on demand from the admin
// console. The alternative was a second, simpler implementation for the
// one-listing case, which is exactly how two paths drift until they disagree
// about which fields Google is allowed to overwrite.
//
// Syncing on approval is what makes "a listing with a place id that has never
// synced" stop being a state the app can be in. That state was invisible:
// it fell through every section of the sync-coverage report, the business
// status override couldn't reach it, and a shop Google had marked closed
// showed as open until the next nightly run happened to pick it up.
// ─────────────────────────────────────────────────────────────────────────────

export type SyncedRow = {
  id: string
  name: string
  phone: string | null
  address: string | null
  details: Record<string, unknown>
  category: string
  community_id: string
}

export type SyncOneResult =
  | { outcome: 'failed' }
  | { outcome: 'synced'; statusChange: StatusChange | null; flaggedClosed: boolean }

// The category's Website field key, matched by label — same convention
// ListingForm.tsx's intake autofill uses, since categories predate a fixed
// key convention for this field. Cached per community so a run with many
// listings across few categories doesn't refetch the same category list once
// per row.
const categoriesCache = new Map<string, Promise<CategoryConfig[]>>()

async function websiteFieldKey(communityId: string, categoryId: string): Promise<string | undefined> {
  let categories = categoriesCache.get(communityId)
  if (!categories) {
    categories = listCategories(communityId)
    categoriesCache.set(communityId, categories)
  }
  const category = (await categories).find((c) => c.id === categoryId)
  return category?.detailFields.find((f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website')?.key
}

/** Loads one listing in the shape syncOneListing needs. Null when it doesn't
 *  exist, isn't live, or has no place id to sync against.
 *
 *  The `approved` filter matches the nightly run's own query, and is not
 *  incidental: syncing an archived listing would ask Google about a place
 *  that's already been taken down, and a CLOSED_PERMANENTLY answer would file
 *  a fresh removal submission for it — putting a listing an admin just
 *  archived straight back into the moderation queue. */
export async function loadSyncableListing(resourceId: string): Promise<SyncedRow | null> {
  const { data } = await getAdminClient()
    .from('resource')
    .select('id,name,phone,address,details,category,community_id')
    .eq('id', resourceId)
    .eq('status', 'approved')
    .maybeSingle()
  const row = data as SyncedRow | null
  if (!row) return null
  return typeof row.details?.placeId === 'string' && row.details.placeId ? row : null
}

/**
 * Refreshes one listing from Google Places and writes the result.
 *
 * Does NOT revalidate cached content — the caller decides, since the nightly
 * run does it once for a whole batch rather than once per listing.
 */
export async function syncOneListing(row: SyncedRow): Promise<SyncOneResult> {
  const supabase = getAdminClient()
  const placeId = String(row.details.placeId)
  const sync = await fetchPlaceSync(placeId)

  if (!sync) {
    // Persisted (not just counted) so admins can see which specific
    // listings are failing, not just how many — see the sync-coverage
    // report in the admin Metrics tab. Cleared on the next successful
    // sync below, so a stale failure never lingers once Google recovers.
    await supabase
      .from('resource')
      .update({
        details: {
          ...row.details,
          lastSyncError: 'Google Places request failed (network error or bad place id).',
          lastSyncFailedAt: new Date().toISOString(),
        },
      })
      .eq('id', row.id)
    return { outcome: 'failed' }
  }

  const details: Record<string, unknown> = {
    ...row.details,
    googleSyncedAt: new Date().toISOString(),
  }
  delete details.lastSyncError
  delete details.lastSyncFailedAt

  // Google-only concepts with no curated counterpart — always refreshed.
  //
  // The transition is recorded alongside the value: businessStatus used to be
  // simply overwritten, so there was no way to know a listing had just closed
  // (or just reopened), no way to notify on it, and no way to tell a two-day-old
  // closure from a two-year-old one.
  let statusChange: StatusChange | null = null
  if (sync.businessStatus) {
    const previous = typeof row.details.businessStatus === 'string' ? row.details.businessStatus : 'UNKNOWN'
    if (previous !== sync.businessStatus) {
      details.businessStatusBefore = previous
      details.businessStatusChangedAt = new Date().toISOString()
      statusChange = {
        name: row.name,
        category: row.category,
        from: previous,
        to: sync.businessStatus,
        communitySlug: row.community_id,
      }
    }
    details.businessStatus = sync.businessStatus
  }
  if (sync.description && !details.googleDescription) details.googleDescription = sync.description

  // Everything else is written only where Google owns the field: one it
  // filled itself, or one still empty. See syncMayWrite in googlePlaces.ts.
  const wrote: OwnableSyncField[] = []
  const update: {
    details: Record<string, unknown>
    name?: string
    phone?: string
    address?: string
  } = { details }

  if (sync.name && syncMayWrite(row.details, 'name', row.name)) {
    update.name = sync.name
    wrote.push('name')
  }
  if (sync.hours && syncMayWrite(row.details, 'hours', row.details?.hours)) {
    details.hours = sync.hours
    wrote.push('hours')
  }
  if (sync.phone && syncMayWrite(row.details, 'phone', row.phone)) {
    update.phone = sync.phone
    wrote.push('phone')
  }
  // Filling an address also keeps `geo` honest, so it stays gated on being
  // empty the same way it always was — now via the shared ownership rule.
  if (sync.address && syncMayWrite(row.details, 'address', row.address)) {
    update.address = sync.address
    wrote.push('address')
  }
  const websiteKey = await websiteFieldKey(row.community_id, row.category)
  if (sync.website && websiteKey && syncMayWrite(row.details, 'website', row.details?.[websiteKey])) {
    details[websiteKey] = sync.website
    wrote.push('website')
  }

  details.googleFields = nextGoogleFields(row.details, wrote)

  await supabase.from('resource').update(update).eq('id', row.id)

  // Route permanent closures through the moderation queue so an admin can
  // review and approve before the listing is removed from the public directory.
  //
  // Skipped entirely when an admin has overridden the status: they have
  // already looked at this listing and said Google is wrong about it, so
  // filing a removal — and emailing about it — every single run would be
  // arguing with them daily. Google's answer is still recorded above, and
  // clearing the override lets this fire on the next run.
  let flaggedClosed = false
  if (sync.businessStatus === 'CLOSED_PERMANENTLY' && !row.details.businessStatusOverride) {
    try {
      const submission = await submitGoogleClosure(row.community_id, row.id)
      if (submission) {
        flaggedClosed = true
        await sendSubmissionNotification(submission).catch(() => {})
      }
    } catch (err) {
      console.error(`[sync] submitGoogleClosure failed for ${row.id}:`, err)
    }
  }

  return { outcome: 'synced', statusChange, flaggedClosed }
}
