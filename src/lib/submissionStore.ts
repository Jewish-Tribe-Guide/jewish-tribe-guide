import { getAdminClient } from './supabase/admin'
import { listCategories, createCategory, getCategoryById } from './categoryStore'
import { isCategorySyncEligible } from './categories'
import { fetchPlaceSync, namesOverlap, OWNABLE_SYNC_FIELDS, type OwnableSyncField } from './googlePlaces'
import { upsertTags } from './tagStore'
import { geocode } from './geo'
import type {
  ResourceRow,
  ResourceSubmission,
  SubmissionRow,
  SubmissionStatus,
  EnrichedSubmission,
  CategorySubmissionPayload,
} from '@/types'

// ── Reads (admin) ────────────────────────────────────────────────────────────

export type SubmissionFunnelStats = {
  pending: number
  approved: number
  rejected: number
  /** approved / (approved + rejected) — null when neither has happened yet,
   *  so callers can render "no data" instead of a misleading 0%. */
  approvalRate: number | null
  avgHoursToApproval: number | null
  medianHoursToApproval: number | null
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Summary stats for the admin's Metrics tab: how many submissions are
// waiting, the approve/reject split, and how long an approved one actually
// sits in the queue before a human acts on it. A full-table scan (every
// submission, ever) rather than a windowed query — this is a low-traffic
// community site, so the whole table is cheap, and a rolling window would
// just add a parameter nobody asked for yet.
export async function getSubmissionFunnelStats(community: string): Promise<SubmissionFunnelStats> {
  const { data, error } = await getAdminClient()
    .from('submission')
    .select('status, created_at, reviewed_at')
    .eq('community_id', community)
  if (error) throw new Error(`Failed to load submission stats: ${error.message}`)

  const rows = data as { status: SubmissionRow['status']; created_at: string; reviewed_at: string | null }[]
  const pending = rows.filter((r) => r.status === 'pending').length
  const approved = rows.filter((r) => r.status === 'approved').length
  const rejected = rows.filter((r) => r.status === 'rejected').length
  const decided = approved + rejected

  const approvalHours = rows
    .filter((r) => r.status === 'approved' && r.reviewed_at)
    .map((r) => (new Date(r.reviewed_at!).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    // A reviewed_at earlier than created_at would only ever come from bad
    // data (clock skew, a manually-edited row) — excluded rather than
    // letting it drag the average negative.
    .filter((h) => h >= 0)
    .sort((a, b) => a - b)

  return {
    pending,
    approved,
    rejected,
    approvalRate: decided > 0 ? approved / decided : null,
    avgHoursToApproval: approvalHours.length
      ? approvalHours.reduce((sum, h) => sum + h, 0) / approvalHours.length
      : null,
    medianHoursToApproval: approvalHours.length ? median(approvalHours) : null,
  }
}

// Pending submissions, newest first, each enriched with the current target row
// (for update/delete) so the admin UI can show a before → after diff.
export async function listPendingSubmissions(community: string): Promise<EnrichedSubmission[]> {
  return listSubmissionsByStatus(community, 'pending')
}

// Submissions in a given status, each enriched the same way as
// listPendingSubmissions — used both by the moderation queue (pending) and
// the admin's read-only history view (approved/rejected), so someone can see
// what was decided and when after the fact. Pending has no reviewed_at yet,
// so it orders by created_at (oldest waiting first isn't the goal here,
// newest submitted first is); approved/rejected order by reviewed_at, most
// recently decided first — that's what "what just happened" means.
export async function listSubmissionsByStatus(
  community: string,
  status: SubmissionStatus,
): Promise<EnrichedSubmission[]> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('submission')
    .select('*')
    .eq('community_id', community)
    .eq('status', status)
    .order(status === 'pending' ? 'created_at' : 'reviewed_at', { ascending: false })

  if (error) throw new Error(`Failed to load submissions: ${error.message}`)
  const submissions = data as SubmissionRow[]

  // Resolve category labels for display.
  const categories = await listCategories(community)
  const labelById = new Map(categories.map((c) => [c.id, c.label]))
  const categoryLabel = (s: SubmissionRow, current: ResourceRow | null): string | undefined => {
    if (s.target_type === 'category') return (s.payload as CategorySubmissionPayload).label
    const slug = (s.payload as { category?: string }).category ?? current?.category
    return slug ? labelById.get(slug) ?? slug : undefined
  }

  const targetIds = [...new Set(submissions.map((s) => s.target_id).filter(Boolean))] as string[]
  let byId = new Map<string, ResourceRow>()
  if (targetIds.length > 0) {
    const { data: current, error: curErr } = await supabase
      .from('resource')
      .select('*')
      .eq('community_id', community)
      .in('id', targetIds)
    if (curErr) throw new Error(`Failed to load current rows: ${curErr.message}`)
    byId = new Map((current as ResourceRow[]).map((r) => [r.id, r]))
  }

  return submissions.map((s) => {
    const current = s.target_id ? byId.get(s.target_id) ?? null : null
    return { ...s, current, categoryLabel: categoryLabel(s, current) }
  })
}

// ── Writes (public submissions) ──────────────────────────────────────────────
// NOTE: there is no `submitCategoryCreate` — suggesting a new category is no
// longer a public path (see src/app/api/submissions/route.ts). `applyCategory`
// below still exists to let moderators approve/reject any older `category`
// submissions still sitting in the queue.

function listingColumns(payload: ResourceSubmission) {
  return {
    category: payload.category,
    name: payload.name.trim(),
    anchor_id: payload.anchorId,
    distance: payload.distance,
    address: payload.address.trim(),
    phone: payload.phone?.trim() || null,
    details: payload.details ?? {},
  }
}

// Like listingColumns, but ensures details.geo (coordinates) is populated —
// the directory sorts listings by straight-line miles from the visitor's typed
// address, computed client-side from this geo. Uses coordinates captured
// client-side from the address autocomplete when available; otherwise geocodes
// the address server-side.
async function listingColumnsWithGeo(payload: ResourceSubmission) {
  const cols = listingColumns(payload)
  let geo = payload.geo ?? null
  if (!geo && payload.address?.trim()) {
    geo = await geocode(payload.address)
  }
  return {
    ...cols,
    details: geo ? { ...cols.details, geo } : cols.details,
  }
}

// Records a proposed NEW listing (operation=create, target_type=listing).
export async function submitListingCreate(community: string, payload: ResourceSubmission): Promise<SubmissionRow> {
  return insertSubmission({
    community_id: community,
    operation: 'create',
    target_type: 'listing',
    target_id: null,
    payload: payload as unknown as Record<string, unknown>,
    note: null,
    submitted_by: payload.submittedBy ?? null,
  })
}

// Records a proposed EDIT to an existing listing.
export async function submitListingUpdate(
  community: string,
  targetId: string,
  payload: ResourceSubmission,
  note: string | null,
  submittedBy: { name?: string; email?: string } | null,
): Promise<SubmissionRow> {
  return insertSubmission({
    community_id: community,
    operation: 'update',
    target_type: 'listing',
    target_id: targetId,
    payload: payload as unknown as Record<string, unknown>,
    note,
    submitted_by: submittedBy,
  })
}

// Records a report that a listing should be removed (operation=delete).
// Fetches the listing's name + category first so the notification email can
// display them — the payload is otherwise empty for delete submissions.
export async function submitListingDelete(
  community: string,
  targetId: string,
  note: string | null,
  submittedBy: { name?: string; email?: string } | null,
): Promise<SubmissionRow> {
  const { data: existing } = await getAdminClient()
    .from('resource')
    .select('name, category')
    .eq('community_id', community)
    .eq('id', targetId)
    .single()

  return insertSubmission({
    community_id: community,
    operation: 'delete',
    target_type: 'listing',
    target_id: targetId,
    payload: existing ? { name: existing.name, category: existing.category } : {},
    note,
    submitted_by: submittedBy,
  })
}

async function insertSubmission(row: {
  community_id: string
  operation: SubmissionRow['operation']
  target_type: SubmissionRow['target_type']
  target_id: string | null
  payload: Record<string, unknown>
  note: string | null
  submitted_by: { name?: string; email?: string } | null
}): Promise<SubmissionRow> {
  const { data, error } = await getAdminClient()
    .from('submission')
    .insert({ ...row, status: 'pending' })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to save submission: ${error.message}`)
  return data as SubmissionRow
}

// Creates a pending deletion submission triggered by the Google sync job when
// it detects businessStatus=CLOSED_PERMANENTLY. Returns the new submission, or
// null if a pending deletion already exists for this listing (idempotent across
// repeated weekly syncs). `community` is the target listing's own community —
// the sync job scans every community's listings, so this must come from the
// resource row it found, never a default.
export async function submitGoogleClosure(community: string, targetId: string): Promise<SubmissionRow | null> {
  const supabase = getAdminClient()

  // Idempotency guard — skip if there is already a pending delete for this row.
  const { data: existing } = await supabase
    .from('submission')
    .select('id')
    .eq('target_id', targetId)
    .eq('operation', 'delete')
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) return null

  const { data: resource } = await supabase
    .from('resource')
    .select('name, category')
    .eq('community_id', community)
    .eq('id', targetId)
    .single()

  return insertSubmission({
    community_id: community,
    operation: 'delete',
    target_type: 'listing',
    target_id: targetId,
    payload: resource ? { name: resource.name, category: resource.category } : {},
    note: 'Google Places reports this business as permanently closed.',
    submitted_by: { name: 'Google Places (automated)' },
  })
}

// ── Moderation (admin) ───────────────────────────────────────────────────────

// Approves a submission and APPLIES its change to the live tables, then marks it
// approved. Returns the updated submission.
export async function approveSubmission(id: string): Promise<SubmissionRow> {
  const supabase = getAdminClient()

  const { data: sub, error: subErr } = await supabase
    .from('submission')
    .select('*')
    .eq('id', id)
    .single()
  if (subErr || !sub) throw new Error(`Submission not found: ${subErr?.message ?? id}`)

  const submission = sub as SubmissionRow

  let affectedResourceId: string | null = null
  if (submission.target_type === 'listing') {
    affectedResourceId = await applyListing(submission)
  } else if (submission.target_type === 'category') {
    await applyCategory(submission)
  } else {
    // tag handled in a later phase.
    throw new Error(`Unsupported submission target_type: ${submission.target_type}`)
  }

  const { data, error } = await supabase
    .from('submission')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      // A `create` arrives with no target_id — there was nothing to point at
      // yet. Recording it now makes the submission point at the listing it
      // produced, which is what lets the caller sync that listing against
      // Google right away instead of leaving it for the nightly run. The
      // moderation card branches on `operation`, so a create still renders as
      // proposed details rather than turning into a diff.
      ...(submission.target_id ? {} : affectedResourceId ? { target_id: affectedResourceId } : {}),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Failed to mark submission approved: ${error.message}`)
  return data as SubmissionRow
}

export async function rejectSubmission(id: string): Promise<SubmissionRow> {
  const { data, error } = await getAdminClient()
    .from('submission')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`Failed to reject submission: ${error.message}`)
  return data as SubmissionRow
}

// ── Google-sync field ownership, decided once at approval time ─────────────
//
// Whether the recurring Google sync (src/app/api/cron/sync-hours) is allowed
// to keep refreshing name/hours/phone/website going forward. The rule: a
// field is Google's if the value being approved matches what Google actually
// has — checked, per field, against the free autofill snapshot the form
// already captured when picking an address ran (see ListingForm.tsx's
// `googleAutofill`), and only falling back to a live Google Places lookup
// for a NEW or CHANGED field autofill never touched. An edit's UNCHANGED
// fields are never re-decided at all — they simply keep whatever ownership
// they already had, and cost nothing to preserve.
const CHECKABLE_FIELDS: OwnableSyncField[] = OWNABLE_SYNC_FIELDS.filter((f) => f !== 'address')

// Recursively sorts object keys before stringifying, so two structurally
// identical values compare equal regardless of what order their keys happen
// to be in — which otherwise isn't guaranteed to survive a round trip.
// Concretely: `hours` is the one OWNABLE_SYNC_FIELDS value that's an object
// rather than a string, and Postgres's jsonb storage does NOT preserve key
// order (it canonicalizes on write). A submission's `details.hours` is built
// client-side in DAY_KEYS' chronological order, but by the time
// approveSubmission re-reads it back out of the `submission` table, jsonb
// has already reordered its keys alphabetically — while `googleAutofill`'s
// per-field snapshot (a pre-stringified JSON *string*, not jsonb) survives
// that same round trip untouched. A plain JSON.stringify comparison between
// the two would then see two different strings for the exact same hours,
// and wrongly conclude the submitter's value "differs from Google's" —
// silently denying sync ownership for something that was never actually
// hand-edited. This is exactly what happened to a real listing (Cheezy
// Vegan Cafe): its hours matched Google's at approval time, but still
// landed as "hand-edited" in the Sync Coverage report.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
}

function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return stableStringify(value)
  const str = String(value).trim()
  // A string holding JSON-encoded structured data — e.g. googleAutofill's
  // `hours` snapshot, captured as JSON.stringify'd text specifically so it
  // survives in a jsonb column as an opaque string rather than another
  // object subject to the same reordering. Parse-then-stably-restringify it
  // too, so it's compared on equal footing with an object-shaped `hours`
  // value from the other side (see stableStringify's comment above).
  if (str.startsWith('{') || str.startsWith('[')) {
    try {
      return stableStringify(JSON.parse(str))
    } catch {
      // Not actually JSON — an ordinary string that happens to start with
      // '{' or '['. Fall through and compare it as plain text.
    }
  }
  return str
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

// Best-effort wrapper — a category/Google lookup failing here shouldn't block
// an approval, same posture as growTagVocabulary's own catch below. Falls
// back to leaving provenance exactly as it was (existing's own googleFields,
// or none for a brand-new listing) rather than guessing.
async function resolveGoogleFields(
  community: string,
  payload: ResourceSubmission,
  existing: ResourceRow | null,
): Promise<string[] | undefined> {
  try {
    return await computeGoogleFields(community, payload, existing)
  } catch (err) {
    console.error('[submissions] resolveGoogleFields failed:', err)
    return Array.isArray(existing?.details?.googleFields) ? (existing.details.googleFields as string[]) : []
  }
}

async function computeGoogleFields(
  community: string,
  payload: ResourceSubmission,
  existing: ResourceRow | null,
): Promise<string[] | undefined> {
  const category = await getCategoryById(community, payload.category)
  // Eligibility depends on hasAddress, which only the fetched category
  // knows — can't check this before the lookup above. A category that
  // fails to resolve at all is treated as ineligible too (nothing to
  // resolve against).
  if (!category || !isCategorySyncEligible(category)) return undefined
  const hoursKey = category.detailFields.find((f) => f.type === 'hours')?.key
  const websiteKey = category.detailFields.find(
    (f) => f.type === 'url' && f.label.trim().toLowerCase() === 'website',
  )?.key

  const currentOf = (field: OwnableSyncField): unknown => {
    if (field === 'name') return payload.name
    if (field === 'phone') return payload.phone
    if (field === 'hours') return hoursKey ? payload.details?.[hoursKey] : undefined
    return websiteKey ? payload.details?.[websiteKey] : undefined
  }
  const priorOf = (field: OwnableSyncField): unknown => {
    if (!existing) return undefined
    if (field === 'name') return existing.name
    if (field === 'phone') return existing.phone
    if (field === 'hours') return hoursKey ? existing.details?.[hoursKey] : undefined
    return websiteKey ? existing.details?.[websiteKey] : undefined
  }
  const priorOwned = new Set<OwnableSyncField>(
    Array.isArray(existing?.details?.googleFields) ? (existing.details.googleFields as OwnableSyncField[]) : [],
  )
  // Absent keys mean autofill never ran for that field this session (address
  // typed by hand, or Google's autocomplete had nothing for it).
  const autofill = (payload.details?.googleAutofill ?? {}) as Partial<Record<OwnableSyncField, string>>

  const result = new Set<OwnableSyncField>(priorOwned)
  // Only fields that are new (create) or actually changed (edit) get
  // (re-)decided — everything else keeps its prior membership untouched.
  const toDecide = CHECKABLE_FIELDS.filter(
    (f) => !existing || normalizeForCompare(currentOf(f)) !== normalizeForCompare(priorOf(f)),
  )

  const needsLiveCheck: OwnableSyncField[] = []
  for (const field of toDecide) {
    const current = currentOf(field)
    if (isEmptyValue(current)) {
      result.add(field) // nothing there to protect — always fillable.
      continue
    }
    const autofilledValue = autofill[field]
    if (autofilledValue !== undefined) {
      if (normalizeForCompare(current) === normalizeForCompare(autofilledValue)) result.add(field)
      else result.delete(field)
      continue
    }
    needsLiveCheck.push(field)
  }

  // The one case that costs a live Google API call: a new/changed field with
  // no autofill snapshot to compare against. Everything else above was free.
  if (needsLiveCheck.length > 0) {
    const placeId = payload.details?.placeId
    const sync = typeof placeId === 'string' && placeId ? await fetchPlaceSync(placeId) : null
    for (const field of needsLiveCheck) {
      const googleValue = sync ? sync[field] : null
      if (googleValue != null && normalizeForCompare(currentOf(field)) === normalizeForCompare(googleValue)) {
        result.add(field)
      } else {
        // Genuinely differs, or Google couldn't be reached to verify —
        // either way, don't risk claiming ownership we can't back up.
        result.delete(field)
      }
    }
  }

  return OWNABLE_SYNC_FIELDS.filter((f) => result.has(f))
}

// A placeId only earns sync eligibility if it actually corresponds to the
// business being listed, not just whatever address was picked. Picking a
// venue and then renaming the listing (a concession stand inside a stadium,
// a mikvah housed in a shul) is common and genuinely useful for Directions —
// verifiedPlaceId still gets it there — but the recurring sync must never
// compare this listing's fields against a different business's Google data,
// and must never let that business's businessStatus (which the sync always
// trusts unconditionally, no ownership gate) mark THIS listing closed.
// Checked once, here, before resolveGoogleFields ever sees the placeId — a
// mismatch means the live-check fallback there won't fire for this listing
// either, which is correct: there's nothing of this business's to verify
// against a different one's Google data.
function withResolvedPlaceId(details: Record<string, unknown>, payload: ResourceSubmission): Record<string, unknown> {
  const placeId = details.placeId
  if (typeof placeId !== 'string' || !placeId) return details
  const autofill = details.googleAutofill as Partial<Record<OwnableSyncField, string>> | undefined
  const pickedName = autofill?.name
  if (!pickedName || namesOverlap(pickedName, payload.name)) return details
  const next: Record<string, unknown> = { ...details, verifiedPlaceId: placeId }
  delete next.placeId
  return next
}

/**
 * Keys in `details` that belong to the sync and the admin console, never to a
 * submitter — and which therefore have to survive an edit.
 *
 * An edit's payload is built from the category's configured `detailFields`
 * only (see ListingForm's `details` initializer), so none of these are in it,
 * and applying an update REPLACES `details` wholesale. Every approved edit was
 * therefore wiping the listing's sync state: when it last synced, what Google
 * said about it, the transition history — and an admin's business-status
 * override, silently undoing a correction someone had deliberately made.
 *
 * `placeId`, `geo` and `googleAutofill` are absent on purpose: the form and
 * listingColumnsWithGeo carry those explicitly, and an edit is allowed to
 * change them. `googleFields` too — resolveGoogleFields recomputes it.
 */
const SUBMITTER_CANNOT_TOUCH = [
  'googleSyncedAt',
  'lastSyncError',
  'lastSyncFailedAt',
  'businessStatus',
  'businessStatusBefore',
  'businessStatusChangedAt',
  'businessStatusOverride',
  'googleDescription',
  'verifiedPlaceId',
  'legacyId',
] as const

function withPreservedInternals(
  details: Record<string, unknown>,
  existing: ResourceRow | null,
): Record<string, unknown> {
  const before = (existing?.details as Record<string, unknown> | undefined) ?? {}
  const next = { ...details }
  for (const key of SUBMITTER_CANNOT_TOUCH) {
    // `in`, not a truthiness check: an edit that legitimately supplies one of
    // these (the intake now captures businessStatus) must still win.
    if (!(key in next) && key in before) next[key] = before[key]
  }
  return next
}

/**
 * Drops `googleSyncedAt` when an edit points the listing at a DIFFERENT Google
 * place — someone correcting a bad match.
 *
 * Saying "last synced at 3am" is only meaningful about the place that was
 * synced. Once the match changes, everything the old sync wrote — hours,
 * phone, business status — describes a different business, and the timestamp
 * is claiming a freshness the row no longer has.
 *
 * It also makes one condition do all the work downstream: the post-approval
 * sync just asks whether `googleSyncedAt` is missing. That's true for a new
 * listing, for a corrected match, and for anything whose first sync failed —
 * which is every case that needs syncing now rather than tonight, and none of
 * the ones that don't. An edit to a note or a tag leaves the timestamp alone
 * and spends no Google call.
 */
function withClearedSyncOnNewPlaceId(
  details: Record<string, unknown>,
  existing: ResourceRow | null,
): Record<string, unknown> {
  const before = (existing?.details as Record<string, unknown> | undefined)?.placeId
  if (!details.placeId || details.placeId === before) return details
  const next = { ...details }
  delete next.googleSyncedAt
  delete next.lastSyncError
  delete next.lastSyncFailedAt
  return next
}

// Swaps the submission's transient `googleAutofill` hint (only ever useful
// for the resolveGoogleFields decision above, not worth keeping on the live
// listing forever) for the resolved `googleFields` list. `googleFields`
// undefined means the category isn't sync-eligible — details pass through
// unchanged, exactly as before this existed.
function withResolvedGoogleFields(
  details: Record<string, unknown>,
  googleFields: string[] | undefined,
): Record<string, unknown> {
  if (googleFields === undefined) return details
  const next: Record<string, unknown> = { ...details, googleFields }
  delete next.googleAutofill
  return next
}

/** Returns the id of the listing the approval affected, so the caller can act
 *  on it — a `create` submission has no target_id until now, which left the
 *  newly published listing unreachable to anything downstream. */
async function applyListing(submission: SubmissionRow): Promise<string | null> {
  const supabase = getAdminClient()
  const now = new Date().toISOString()

  if (submission.operation === 'create') {
    const payload = submission.payload as unknown as ResourceSubmission
    payload.details = withResolvedPlaceId(payload.details, payload)
    const googleFields = await resolveGoogleFields(submission.community_id, payload, null)
    payload.details = withResolvedGoogleFields(payload.details, googleFields)
    const { data: created, error } = await supabase
      .from('resource')
      .insert({
        ...(await listingColumnsWithGeo(payload)),
        community_id: submission.community_id,
        status: 'approved',
        submitted_by: submission.submitted_by,
        reviewed_at: now,
      })
      .select('id')
      .single()
    if (error) throw new Error(`Failed to create listing: ${error.message}`)
    await growTagVocabulary(submission.community_id, payload)
    return (created as { id: string } | null)?.id ?? null
  }

  if (submission.operation === 'update') {
    if (!submission.target_id) throw new Error('Update submission missing target_id.')
    const payload = submission.payload as unknown as ResourceSubmission
    const { data: existingData } = await supabase
      .from('resource')
      .select('*')
      .eq('community_id', submission.community_id)
      .eq('id', submission.target_id)
      .maybeSingle()
    payload.details = withResolvedPlaceId(payload.details, payload)
    const googleFields = await resolveGoogleFields(
      submission.community_id,
      payload,
      existingData as ResourceRow | null,
    )
    payload.details = withResolvedGoogleFields(payload.details, googleFields)
    payload.details = withPreservedInternals(payload.details, existingData as ResourceRow | null)
    payload.details = withClearedSyncOnNewPlaceId(payload.details, existingData as ResourceRow | null)
    const { error } = await supabase
      .from('resource')
      .update({ ...(await listingColumnsWithGeo(payload)), reviewed_at: now })
      .eq('community_id', submission.community_id)
      .eq('id', submission.target_id)
    if (error) throw new Error(`Failed to update listing: ${error.message}`)
    await growTagVocabulary(submission.community_id, payload)
    return submission.target_id
  }

  if (submission.operation === 'delete') {
    if (!submission.target_id) throw new Error('Delete submission missing target_id.')
    // Soft delete: archived rows never show publicly but can be restored.
    const { error } = await supabase
      .from('resource')
      .update({ status: 'archived', reviewed_at: now })
      .eq('community_id', submission.community_id)
      .eq('id', submission.target_id)
    if (error) throw new Error(`Failed to archive listing: ${error.message}`)
    return submission.target_id
  }

  return null
}

// When a listing with tag fields is approved, add any newly-typed tags to the
// vocabulary so future submitters can pick them. Best-effort — a vocab hiccup
// shouldn't block approving the listing.
async function growTagVocabulary(community: string, payload: ResourceSubmission): Promise<void> {
  try {
    const category = await getCategoryById(community, payload.category)
    if (!category) return
    for (const field of category.detailFields) {
      if (field.type !== 'tags' || !field.tagGroup) continue
      const labels = payload.details?.[field.key]
      if (Array.isArray(labels) && labels.length > 0) {
        await upsertTags(community, labels as string[], field.tagGroup)
      }
    }
  } catch (err) {
    console.error('[submissions] growTagVocabulary failed:', err)
  }
}

// Approving a category creates the category, then its first listing (approved).
async function applyCategory(submission: SubmissionRow): Promise<void> {
  if (submission.operation !== 'create') {
    throw new Error(`Unsupported category operation: ${submission.operation}`)
  }
  const payload = submission.payload as unknown as CategorySubmissionPayload

  const category = await createCategory(submission.community_id, {
    label: payload.label,
    icon: payload.icon,
    description: payload.description,
    upvotesEnabled: payload.upvotesEnabled,
  })

  const first = payload.firstListing
  const geo = first.geo ?? (first.address?.trim() ? await geocode(first.address) : null)
  const { error } = await getAdminClient().from('resource').insert({
    community_id: submission.community_id,
    category: category.id,
    name: first.name.trim(),
    anchor_id: first.anchorId || 'community',
    distance: null,
    address: first.address.trim(),
    phone: first.phone?.trim() || null,
    details: geo ? { geo } : {},
    status: 'approved',
    submitted_by: submission.submitted_by,
    reviewed_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Failed to create first listing: ${error.message}`)
}
