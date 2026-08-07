import { cacheLife, cacheTag } from 'next/cache'
import { TAGS } from './cacheTags'
import { getAdminClient } from './supabase/admin'
import type { CategoryConfig } from './categories'
import { isValidPhone, isHttpUrl } from './validation'
import { LIMITS, tooLong, oversizedField } from './limits'
import { getVoteCounts } from './voteStore'
import type { ResourceRow, DirectoryResource, ResourceSubmission } from '@/types'

// Flattens a DB row into the shape the display components consume: shared fields
// at the top level, with `details` (category-specific keys like isKosher, hours)
// merged on top. The Google-sync fields (placeId, googleSyncedAt, businessStatus)
// live in `details`, so they surface here automatically via the `...row.details`
// spread — no explicit mapping needed.
export function normalizeRow(row: ResourceRow): DirectoryResource {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    anchorId: row.anchor_id,
    distance: row.distance ?? 0,
    address: row.address ?? '',
    phone: row.phone ?? undefined,
    ...row.details,
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────────

// Approved resources for a category. Listings are no longer hospital-scoped —
// every listing shows under every hospital, and distance to the selected hospital
// is computed on the client from the listing's geocoded coordinates.
export async function listApprovedResources(
  community: string,
  opts: { category?: string } = {},
): Promise<DirectoryResource[]> {
  'use cache'
  // Tagged per community rather than per category: approving a listing, an
  // edit, and an archive all change one category's list, but the admin write
  // paths don't reliably know which — and a stale directory is the failure
  // that matters here, not one extra query.
  cacheTag(TAGS.resources(community))
  // Upvote counts ride along in this result, so they're as stale as the list.
  // That's the right trade for a soft signal: an hour-old vote tally is fine,
  // and making it live would mean giving up caching the listings themselves.
  cacheLife('hours')

  let query = getAdminClient()
    .from('resource')
    .select('*')
    .eq('community_id', community)
    .eq('status', 'approved')
  if (opts.category) query = query.eq('category', opts.category)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load resources: ${error.message}`)

  const rows = (data as ResourceRow[]).map(normalizeRow)
  const counts = await getVoteCounts(rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, upvotes: counts.get(r.id) ?? 0 }))
}

// Fetches a single listing by id (any status). Used to prefill the edit form.
export async function getResourceById(id: string): Promise<DirectoryResource | null> {
  const { data, error } = await getAdminClient()
    .from('resource')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load resource: ${error.message}`)
  return data ? normalizeRow(data as ResourceRow) : null
}

// ── Archived listings (admin) ────────────────────────────────────────────────
// A listing "removal" (an approved delete-type submission — see
// submissionStore.ts) is a soft delete: the row moves to status='archived'
// instead of being dropped, so it never shows publicly but stays recoverable.
// Nothing purges these on its own, so without an admin view they'd just
// accumulate forever — these back that view.

// Archived listings, newest-removed first. Any status other than 'archived'
// is out of scope here — this is specifically the cleanup queue.
export async function listArchivedResources(): Promise<ResourceRow[]> {
  const { data, error } = await getAdminClient()
    .from('resource')
    .select('*')
    .eq('status', 'archived')
    .order('reviewed_at', { ascending: false })

  if (error) throw new Error(`Failed to load archived listings: ${error.message}`)
  return data as ResourceRow[]
}

// Un-archives a listing back to 'approved' — it reappears on the public site
// exactly as it was. Scoped to currently-archived rows so this can't be used
// to force an unrelated pending/rejected row live.
export async function restoreResource(id: string): Promise<ResourceRow | null> {
  const { data, error } = await getAdminClient()
    .from('resource')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'archived')
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Failed to restore listing: ${error.message}`)
  return data as ResourceRow | null
}

// Permanently deletes an archived listing (votes/tags cascade via FK) —
// irreversible. Scoped to currently-archived rows for the same reason as
// restoreResource: this is a cleanup action, not a general-purpose delete.
export async function hardDeleteArchivedResource(id: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('resource')
    .delete()
    .eq('id', id)
    .eq('status', 'archived')
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`Failed to permanently delete listing: ${error.message}`)
  return !!data
}

// ── Validation ───────────────────────────────────────────────────────────────

// Validates a listing submission payload against its category. `category` is the
// resolved CategoryConfig (or null if the category doesn't exist). Returns error
// strings (empty = valid).
export function validateSubmission(
  submission: ResourceSubmission,
  category: CategoryConfig | null,
): string[] {
  const errs: string[] = []

  if (!category) errs.push('Please choose a valid category.')
  if (!submission.name?.trim()) errs.push('Name is required.')
  // Categories without an address (e.g. WhatsApp groups) skip the requirement —
  // other listings need one (distance to each hospital is computed from it).
  if (category?.hasAddress !== false && !submission.address?.trim()) {
    errs.push('Address is required.')
  }
  if (category?.hasPhone !== false && submission.phone?.trim() && !isValidPhone(submission.phone)) {
    errs.push('Please enter a valid phone number.')
  }

  // Required category-specific fields (only those currently visible via showIf).
  for (const field of category?.detailFields ?? []) {
    if (!field.required) continue
    if (field.showIf && submission.details?.[field.showIf.field] !== field.showIf.equals) continue
    const value = submission.details?.[field.key]
    if (value === undefined || value === null || String(value).trim() === '') {
      errs.push(`${field.label} is required.`)
    }
  }

  // URL fields render as clickable link buttons on approved cards — only allow
  // http/https so a `javascript:`/`data:` URL can't be smuggled into an href.
  for (const field of category?.detailFields ?? []) {
    if (field.type !== 'url') continue
    const value = submission.details?.[field.key]
    if (typeof value === 'string' && value.trim() && !isHttpUrl(value)) {
      errs.push(`${field.label} must be a valid http(s) link.`)
    }
  }

  // Size caps — keep junk out of the queue and bound geocode/email cost.
  if (tooLong(submission.name, LIMITS.name)) errs.push('Name is too long.')
  if (tooLong(submission.address, LIMITS.address)) errs.push('Address is too long.')
  if (tooLong(submission.phone, LIMITS.phone)) errs.push('Phone number is too long.')
  if (oversizedField(submission.details)) errs.push('One of the fields is too long.')

  return errs
}

// ── Field removal cleanup ────────────────────────────────────────────────────
// When an admin turns off address/phone or deletes a detail field from a
// category that already has listings, the old values would otherwise sit
// orphaned in `resource.address`/`phone`/`details` forever — invisible (the
// card no longer renders a field the category doesn't declare) but still in
// the database. These let the category editor warn how many listings are
// affected, then actually wipe that data when the admin confirms.

// Detail keys that only make sense alongside a real address (Google Places
// sync results) — cleared together with `address` since they'd otherwise
// reference a place no longer shown anywhere.
const ADDRESS_DERIVED_DETAIL_KEYS = ['geo', 'placeId', 'googleSyncedAt', 'businessStatus', 'googleDescription']

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** How many of a category's listings currently have data in the given
 *  field(s) — used to warn an admin before they remove a field that would
 *  orphan real data. Counts listings of every status (pending/approved/
 *  rejected), same scope `deleteCategory` uses. */
export async function countCategoryFieldUsage(
  categoryId: string,
  opts: { address?: boolean; phone?: boolean; fieldKeys?: string[] },
): Promise<{ address: number; phone: number; fields: Record<string, number> }> {
  const { data, error } = await getAdminClient()
    .from('resource')
    .select('address, phone, details')
    .eq('category', categoryId)
  if (error) throw new Error(`Failed to check existing listings: ${error.message}`)

  const rows = (data ?? []) as { address: string | null; phone: string | null; details: Record<string, unknown> }[]
  const fields: Record<string, number> = {}
  for (const key of opts.fieldKeys ?? []) fields[key] = 0

  let address = 0
  let phone = 0
  for (const row of rows) {
    if (opts.address && hasValue(row.address)) address++
    if (opts.phone && hasValue(row.phone)) phone++
    for (const key of opts.fieldKeys ?? []) {
      if (hasValue(row.details?.[key])) fields[key]++
    }
  }
  return { address, phone, fields }
}

/** Actually clears the given field(s) from every listing in a category —
 *  irreversible. Called only after the admin has confirmed against the
 *  counts from `countCategoryFieldUsage`. */
export async function clearCategoryFieldData(
  categoryId: string,
  opts: { address?: boolean; phone?: boolean; fieldKeys?: string[] },
): Promise<{ updated: number }> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('resource')
    .select('id, address, phone, details')
    .eq('category', categoryId)
  if (error) throw new Error(`Failed to load existing listings: ${error.message}`)

  const rows = (data ?? []) as { id: string; address: string | null; phone: string | null; details: Record<string, unknown> }[]
  let updated = 0

  for (const row of rows) {
    const update: { address?: null; phone?: null; details?: Record<string, unknown> } = {}
    if (opts.address && hasValue(row.address)) update.address = null
    if (opts.phone && hasValue(row.phone)) update.phone = null

    let details: Record<string, unknown> | null = null
    const keysToStrip = [
      ...(opts.address ? ADDRESS_DERIVED_DETAIL_KEYS : []),
      ...(opts.fieldKeys ?? []).flatMap((k) => [k, `${k}_sometimes`]),
    ]
    for (const key of keysToStrip) {
      if (key in row.details) {
        details ??= { ...row.details }
        delete details[key]
      }
    }
    if (details) update.details = details

    if (Object.keys(update).length === 0) continue
    const { error: updErr } = await supabase.from('resource').update(update).eq('id', row.id)
    if (updErr) throw new Error(`Failed to clear data for a listing: ${updErr.message}`)
    updated++
  }

  return { updated }
}
