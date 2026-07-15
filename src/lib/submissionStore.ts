import { getAdminClient } from './supabase/admin'
import { listCategories, createCategory, getCategoryById } from './categoryStore'
import { upsertTags } from './tagStore'
import { geocode } from './geo'
import type {
  ResourceRow,
  ResourceSubmission,
  SubmissionRow,
  EnrichedSubmission,
  CategorySubmissionPayload,
} from '@/types'

// ── Reads (admin) ────────────────────────────────────────────────────────────

// Pending submissions, newest first, each enriched with the current target row
// (for update/delete) so the admin UI can show a before → after diff.
export async function listPendingSubmissions(): Promise<EnrichedSubmission[]> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('submission')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load submissions: ${error.message}`)
  const submissions = data as SubmissionRow[]

  // Resolve category labels for display.
  const categories = await listCategories()
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
      .in('id', targetIds)
    if (curErr) throw new Error(`Failed to load current rows: ${curErr.message}`)
    byId = new Map((current as ResourceRow[]).map((r) => [r.id, r]))
  }

  return submissions.map((s) => {
    const current = s.target_id ? byId.get(s.target_id) ?? null : null
    return { ...s, current, categoryLabel: categoryLabel(s, current) }
  })
}

// Records a proposed NEW category (with its first listing).
export async function submitCategoryCreate(
  payload: CategorySubmissionPayload,
  submittedBy: { name?: string; email?: string } | null,
): Promise<SubmissionRow> {
  return insertSubmission({
    operation: 'create',
    target_type: 'category',
    target_id: null,
    payload: payload as unknown as Record<string, unknown>,
    note: null,
    submitted_by: submittedBy,
  })
}

// ── Writes (public submissions) ──────────────────────────────────────────────

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
export async function submitListingCreate(payload: ResourceSubmission): Promise<SubmissionRow> {
  return insertSubmission({
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
  targetId: string,
  payload: ResourceSubmission,
  note: string | null,
  submittedBy: { name?: string; email?: string } | null,
): Promise<SubmissionRow> {
  return insertSubmission({
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
  targetId: string,
  note: string | null,
  submittedBy: { name?: string; email?: string } | null,
): Promise<SubmissionRow> {
  const { data: existing } = await getAdminClient()
    .from('resource')
    .select('name, category')
    .eq('id', targetId)
    .single()

  return insertSubmission({
    operation: 'delete',
    target_type: 'listing',
    target_id: targetId,
    payload: existing ? { name: existing.name, category: existing.category } : {},
    note,
    submitted_by: submittedBy,
  })
}

async function insertSubmission(row: {
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
// repeated weekly syncs).
export async function submitGoogleClosure(targetId: string): Promise<SubmissionRow | null> {
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
    .eq('id', targetId)
    .single()

  return insertSubmission({
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

  if (submission.target_type === 'listing') {
    await applyListing(submission)
  } else if (submission.target_type === 'category') {
    await applyCategory(submission)
  } else {
    // tag handled in a later phase.
    throw new Error(`Unsupported submission target_type: ${submission.target_type}`)
  }

  const { data, error } = await supabase
    .from('submission')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
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

async function applyListing(submission: SubmissionRow): Promise<void> {
  const supabase = getAdminClient()
  const now = new Date().toISOString()

  if (submission.operation === 'create') {
    const payload = submission.payload as unknown as ResourceSubmission
    const { error } = await supabase.from('resource').insert({
      ...(await listingColumnsWithGeo(payload)),
      status: 'approved',
      submitted_by: submission.submitted_by,
      reviewed_at: now,
    })
    if (error) throw new Error(`Failed to create listing: ${error.message}`)
    await growTagVocabulary(payload)
    return
  }

  if (submission.operation === 'update') {
    if (!submission.target_id) throw new Error('Update submission missing target_id.')
    const payload = submission.payload as unknown as ResourceSubmission
    const { error } = await supabase
      .from('resource')
      .update({ ...(await listingColumnsWithGeo(payload)), reviewed_at: now })
      .eq('id', submission.target_id)
    if (error) throw new Error(`Failed to update listing: ${error.message}`)
    await growTagVocabulary(payload)
    return
  }

  if (submission.operation === 'delete') {
    if (!submission.target_id) throw new Error('Delete submission missing target_id.')
    // Soft delete: archived rows never show publicly but can be restored.
    const { error } = await supabase
      .from('resource')
      .update({ status: 'archived', reviewed_at: now })
      .eq('id', submission.target_id)
    if (error) throw new Error(`Failed to archive listing: ${error.message}`)
  }
}

// When a listing with tag fields is approved, add any newly-typed tags to the
// vocabulary so future submitters can pick them. Best-effort — a vocab hiccup
// shouldn't block approving the listing.
async function growTagVocabulary(payload: ResourceSubmission): Promise<void> {
  try {
    const category = await getCategoryById(payload.category)
    if (!category) return
    for (const field of category.detailFields) {
      if (field.type !== 'tags' || !field.tagGroup) continue
      const labels = payload.details?.[field.key]
      if (Array.isArray(labels) && labels.length > 0) {
        await upsertTags(labels as string[], field.tagGroup)
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

  const category = await createCategory({
    label: payload.label,
    icon: payload.icon,
    description: payload.description,
    upvotesEnabled: payload.upvotesEnabled,
  })

  const first = payload.firstListing
  const geo = first.geo ?? (first.address?.trim() ? await geocode(first.address) : null)
  const { error } = await getAdminClient().from('resource').insert({
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
