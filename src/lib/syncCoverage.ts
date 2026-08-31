import { getAdminClient } from './supabase/admin'
import { listCategoriesUncached, getCategoryById } from './categoryStore'
import { isCategorySyncEligible, type CategoryConfig } from './categories'
import {
  OWNABLE_SYNC_FIELDS,
  fetchPlaceSync,
  nextGoogleFields,
  syncMayWrite,
  type OwnableSyncField,
  type PlaceSync,
} from './googlePlaces'
import { formatHoursSummary, type BusinessStatus } from './hours'

// ── The admin-visible "sync coverage" report — three answers to "is the
// Google Places auto-sync doing what I think it's doing":
//
//   1. neverSynced       — no placeId at all; the sync never touches these.
//   2. protectedFields    — has a placeId, but specific fields (name/hours/
//                           phone/website) were hand-edited, so the sync
//                           deliberately leaves them alone forever. Not a
//                           problem — this is the ownership rule working as
//                           intended (see googlePlaces.ts) — but invisible
//                           without this report, so an admin has no way to
//                           know a field has quietly stopped following Google.
//   3. failing            — has a placeId, sync attempted, but the Google
//                           Places request itself keeps failing (see
//                           details.lastSyncError, stamped by the cron route).
//
// All three read straight from `resource.details` — no new tracking beyond
// the lastSyncError/lastSyncFailedAt stamp the cron route already writes on
// failure. checkAgainstGoogle below is the one thing that costs a live
// Google API call, so it's on-demand (one listing, one click) rather than
// pre-computed for the whole directory on every report load. ──

type SyncRow = {
  id: string
  name: string
  category: string
  phone: string | null
  address: string | null
  details: Record<string, unknown>
  community_id: string
}

export type SyncCoverageListing = {
  id: string
  name: string
  category: string
  categoryLabel: string
}

export type FieldValue = { field: OwnableSyncField; label: string; ourValue: string }

export type NeverSyncedReport = SyncCoverageListing & { fields: FieldValue[] }
export type ProtectedFieldReport = SyncCoverageListing & { fields: FieldValue[] }

export type FailingSyncReport = SyncCoverageListing & {
  lastSyncError: string
  lastSyncFailedAt: string | null
}

/** A listing Google says isn't trading, or one an admin has overruled. Listed
 *  together because they're the same question — "is what the public sees about
 *  this business right?" — seen from either side. */
export type ClosureReport = SyncCoverageListing & {
  /** What Google last said. */
  googleStatus: BusinessStatus | null
  /** The admin's correction, when one is set. */
  override: BusinessStatus | null
  /** ISO timestamp of the last time Google's answer changed. */
  changedAt: string | null
}

/** Has a place id, so the sync is expected to cover it — but no run has ever
 *  touched it. Should be an empty list: a listing is synced the moment it's
 *  approved (see the admin submissions route), so anything here arrived some
 *  other way — a backfill script, a direct database edit — or was approved
 *  while Google was unreachable. Surfaced rather than assumed away, because
 *  this is precisely the state that used to fall through every section here:
 *  no status to report, so nothing to correct, on a listing that is live. */
export type PendingFirstSyncReport = SyncCoverageListing & { addedStatus: BusinessStatus | null }

export type SyncCoverage = {
  neverSynced: NeverSyncedReport[]
  pendingFirstSync: PendingFirstSyncReport[]
  protectedFields: ProtectedFieldReport[]
  failing: FailingSyncReport[]
  closures: ClosureReport[]
}

export const FIELD_LABELS: Record<OwnableSyncField, string> = {
  name: 'Name',
  hours: 'Hours',
  phone: 'Phone',
  address: 'Address',
  website: 'Website',
}

// Address is excluded: it's always fill-once-when-empty by design (see
// syncMayWrite), so once a listing has any address at all it's permanently
// "protected" — that's the normal, universal case, not a signal worth
// surfacing the way a manually-typed phone number is.
const REPORTABLE_FIELDS: OwnableSyncField[] = OWNABLE_SYNC_FIELDS.filter((f) => f !== 'address')

function websiteFieldKey(category: CategoryConfig): string | undefined {
  return category.detailFields.find((f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website')?.key
}

function currentValue(field: OwnableSyncField, row: SyncRow, websiteKey: string | undefined): unknown {
  if (field === 'name') return row.name
  if (field === 'phone') return row.phone
  if (field === 'address') return row.address
  if (field === 'hours') return row.details?.hours
  return websiteKey ? row.details?.[websiteKey] : undefined
}

function displayValue(field: OwnableSyncField, row: SyncRow, websiteKey: string | undefined): string {
  if (field === 'hours') return formatHoursSummary(row.details?.hours)
  const v = currentValue(field, row, websiteKey)
  return typeof v === 'string' && v.trim() ? v : '—'
}

// A field the category doesn't even have (no phone, no Website detail field)
// isn't worth reporting as "protected" — there's nothing to sync either way.
function categoryHasField(field: OwnableSyncField, category: CategoryConfig, websiteKey: string | undefined): boolean {
  if (field === 'phone') return category.hasPhone !== false
  if (field === 'website') return !!websiteKey
  return true
}

// Fields the sync is declining to write for this listing right now — either
// a person edited them (provenance recorded, not in details.googleFields) or,
// for a row that predates provenance tracking, the field already has a value.
function protectedFieldsFor(row: SyncRow, category: CategoryConfig): OwnableSyncField[] {
  const websiteKey = websiteFieldKey(category)
  return REPORTABLE_FIELDS.filter((f) => categoryHasField(f, category, websiteKey)).filter(
    (f) => !syncMayWrite(row.details, f, currentValue(f, row, websiteKey)),
  )
}

// Every field this category actually has, with its current value — no
// ownership concept to filter by here, since a listing with no placeId was
// never compared against anything. Used for the "Never synced" report so an
// admin can review what's actually on file without opening each listing.
function allFieldsFor(row: SyncRow, category: CategoryConfig): FieldValue[] {
  const websiteKey = websiteFieldKey(category)
  return REPORTABLE_FIELDS.filter((f) => categoryHasField(f, category, websiteKey)).map((f) => ({
    field: f,
    label: FIELD_LABELS[f],
    ourValue: displayValue(f, row, websiteKey),
  }))
}

export async function getSyncCoverage(community: string): Promise<SyncCoverage> {
  const [categories, { data, error }] = await Promise.all([
    listCategoriesUncached(community),
    getAdminClient()
      .from('resource')
      .select('id,name,category,phone,address,details,community_id')
      .eq('community_id', community)
      .eq('status', 'approved'),
  ])
  if (error) throw new Error(`Failed to load resources: ${error.message}`)

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const rows = (data ?? []) as SyncRow[]

  const neverSynced: NeverSyncedReport[] = []
  const protectedFields: ProtectedFieldReport[] = []
  const failing: FailingSyncReport[] = []
  const closures: ClosureReport[] = []
  const pendingFirstSync: PendingFirstSyncReport[] = []

  for (const row of rows) {
    const category = categoryById.get(row.category)
    if (!category || !isCategorySyncEligible(category)) continue

    const listing: SyncCoverageListing = {
      id: row.id,
      name: row.name,
      category: row.category,
      categoryLabel: category.pluralLabel,
    }

    // Before the placeId check below, deliberately: a listing whose placeId
    // was cleared while it was closed has left the sync query entirely, so its
    // badge can never clear on its own. That's exactly the case an admin needs
    // to find here, and `continue` would have skipped it.
    const googleStatus = asStatus(row.details?.businessStatus)
    const override = asStatus(row.details?.businessStatusOverride)
    if ((googleStatus && googleStatus !== 'OPERATIONAL') || override) {
      const changedAt = row.details?.businessStatusChangedAt
      closures.push({
        ...listing,
        googleStatus,
        override,
        changedAt: typeof changedAt === 'string' ? changedAt : null,
      })
    }

    const placeId = row.details?.placeId
    if (typeof placeId !== 'string' || !placeId) {
      neverSynced.push({ ...listing, fields: allFieldsFor(row, category) })
      continue
    }

    if (!row.details?.googleSyncedAt) {
      pendingFirstSync.push({ ...listing, addedStatus: googleStatus })
    }

    const websiteKey = websiteFieldKey(category)
    const fields = protectedFieldsFor(row, category).map((f) => ({
      field: f,
      label: FIELD_LABELS[f],
      ourValue: displayValue(f, row, websiteKey),
    }))
    if (fields.length > 0) protectedFields.push({ ...listing, fields })

    const lastSyncError = row.details?.lastSyncError
    if (typeof lastSyncError === 'string' && lastSyncError) {
      const failedAt = row.details?.lastSyncFailedAt
      failing.push({
        ...listing,
        lastSyncError,
        lastSyncFailedAt: typeof failedAt === 'string' ? failedAt : null,
      })
    }
  }

  return { neverSynced, pendingFirstSync, protectedFields, failing, closures }
}

/**
 * Sets or clears an admin's business-status override.
 *
 * Only the override is written — Google's own `businessStatus` is left exactly
 * as the sync last recorded it, so the console keeps showing the disagreement
 * and clearing the override drops the listing back to reality rather than to a
 * remembered guess.
 */
export async function setBusinessStatusOverride(
  resourceId: string,
  status: BusinessStatus | null,
): Promise<void> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('resource')
    .select('details')
    .eq('id', resourceId)
    .single()
  if (error || !data) throw new Error(`Listing not found: ${error?.message ?? resourceId}`)

  const details = { ...((data.details ?? {}) as Record<string, unknown>) }
  if (status) details.businessStatusOverride = status
  else delete details.businessStatusOverride

  const { error: updateError } = await supabase
    .from('resource')
    .update({ details })
    .eq('id', resourceId)
  if (updateError) throw new Error(`Failed to save override: ${updateError.message}`)
}

function asStatus(v: unknown): BusinessStatus | null {
  return v === 'OPERATIONAL' || v === 'CLOSED_TEMPORARILY' || v === 'CLOSED_PERMANENTLY' ? v : null
}

export type SyncCheckField = {
  field: OwnableSyncField
  label: string
  ours: string
  google: string
  matches: boolean
}

function googleValuesFor(sync: PlaceSync): Record<OwnableSyncField, string> {
  return {
    name: sync.name?.trim() || '—',
    hours: sync.hours ? formatHoursSummary(sync.hours) : '—',
    phone: sync.phone?.trim() || '—',
    address: sync.address?.trim() || '—',
    website: sync.website?.trim() || '—',
  }
}

async function loadRowAndCategory(
  resourceId: string,
): Promise<{ supabase: ReturnType<typeof getAdminClient>; row: SyncRow; category: CategoryConfig }> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('resource')
    .select('id,name,category,phone,address,details,community_id')
    .eq('id', resourceId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load listing: ${error.message}`)
  if (!data) throw new Error('Listing not found.')
  const row = data as SyncRow

  const placeId = row.details?.placeId
  if (typeof placeId !== 'string' || !placeId) throw new Error('This listing has no Google place id.')

  const category = await getCategoryById(row.community_id, row.category)
  if (!category) throw new Error('Category not found.')

  return { supabase, row, category }
}

// On-demand only (never pre-computed): fetches this one listing's current
// Google Places data and compares it against every field the sync is
// currently declining to write, so an admin can see what a "manually
// entered" field would become if it were ever handed back to Google —
// including when Google simply has nothing for it at all.
export async function checkListingAgainstGoogle(resourceId: string): Promise<SyncCheckField[]> {
  const { row, category } = await loadRowAndCategory(resourceId)
  const placeId = row.details.placeId as string

  const sync = await fetchPlaceSync(placeId)
  if (!sync) throw new Error('Could not reach Google Places right now — try again shortly.')

  const websiteKey = websiteFieldKey(category)
  const googleValue = googleValuesFor(sync)

  return protectedFieldsFor(row, category).map((f) => {
    const ours = displayValue(f, row, websiteKey)
    const google = googleValue[f]
    return { field: f, label: FIELD_LABELS[f], ours, google, matches: ours === google }
  })
}

// Hands a hand-edited field back to the sync. Only ever called after "Check
// against Google" showed a match — but re-verifies live rather than trusting
// that stale client-held result, since an admin could sit on the check
// result for a while (or a field could drift) before clicking through.
// Doesn't touch `details.googleFields` at all when the live values don't
// actually match, same "don't risk claiming ownership we can't back up"
// rule computeGoogleFields follows in submissionStore.ts.
export async function resumeSyncField(resourceId: string, field: OwnableSyncField): Promise<SyncCheckField> {
  const { supabase, row, category } = await loadRowAndCategory(resourceId)
  const placeId = row.details.placeId as string
  if (!protectedFieldsFor(row, category).includes(field)) {
    throw new Error('This field is already following Google.')
  }

  const sync = await fetchPlaceSync(placeId)
  if (!sync) throw new Error('Could not reach Google Places right now — try again shortly.')

  const websiteKey = websiteFieldKey(category)
  const google = googleValuesFor(sync)[field]
  const ours = displayValue(field, row, websiteKey)
  const matches = ours === google

  if (matches) {
    const googleFields = nextGoogleFields(row.details, [field])
    const { error: updateError } = await supabase
      .from('resource')
      .update({ details: { ...row.details, googleFields } })
      .eq('id', resourceId)
    if (updateError) throw new Error(`Failed to update listing: ${updateError.message}`)
  }

  return { field, label: FIELD_LABELS[field], ours, google, matches }
}
