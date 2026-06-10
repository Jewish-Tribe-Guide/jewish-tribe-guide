import { getAdminClient } from './supabase/admin'
import type { CategoryConfig } from './categories'
import { isValidPhone } from './validation'
import { getVoteCounts } from './voteStore'
import type { ResourceRow, DirectoryResource, ResourceSubmission } from '@/types'

// Flattens a DB row into the shape the display components consume: shared fields
// at the top level, with `details` (category-specific keys like isKosher, hours)
// merged on top.
export function normalizeRow(row: ResourceRow): DirectoryResource {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    hospitalId: row.hospital_id,
    distance: row.distance ?? 0,
    travel: row.travel ?? null,
    address: row.address ?? '',
    phone: row.phone ?? undefined,
    ...row.details,
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────────

// Approved resources for a category. Listings are no longer hospital-scoped —
// every listing shows under every hospital, and distance to the selected hospital
// is computed on the client from the listing's geocoded coordinates.
export async function listApprovedResources(opts: { category?: string } = {}): Promise<DirectoryResource[]> {
  let query = getAdminClient().from('resource').select('*').eq('status', 'approved')
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
  // Community categories (e.g. WhatsApp groups) have no address. Other listings
  // need an address (distance to each hospital is computed from it).
  if (!category?.community) {
    if (!submission.address?.trim()) errs.push('Address is required.')
    if (submission.phone?.trim() && !isValidPhone(submission.phone)) {
      errs.push('Please enter a valid phone number.')
    }
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

  return errs
}
