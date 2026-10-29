import { validateSubmission, getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { submitListingUpdate, submitListingDelete, approveSubmission } from '@/lib/submissionStore'
import { normalizeUrl } from '@/lib/validation'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { runWalkRoutesAfterChange } from '@/lib/walkRouteJob'
import { after, type NextRequest } from 'next/server'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import type { ResourceSubmission } from '@/types'

// An admin's own edits to a listing on Places (the admin redesign's step 3:
// "edit directly, no suggest-then-approve"). Each is filed as a suggestion
// and approved on the spot, as POST /api/admin/listings adds one, so it
// goes through the same validation, Google-field ownership and history as
// a decision on To do, and History shows who did it.

// PATCH /api/admin/listings/:id — update the listing with `payload`.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/listings/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as { payload?: ResourceSubmission } | null
  const payload = body?.payload
  if (!payload) return Response.json({ ok: false, errors: ['Missing listing details.'] }, { status: 400 })

  const current = await getResourceRowById(id, community.slug)
  if (!current || current.status !== 'approved') return Response.json({ ok: false, errors: ['That place isn’t on the site.'] }, { status: 404 })

  const category = await getCategoryById(community.slug, payload.category)
  // Same "add https:// before validating/storing" as /api/submissions.
  if (payload.details) {
    for (const field of category?.detailFields ?? []) {
      if (field.type !== 'url') continue
      const raw = payload.details[field.key]
      if (typeof raw === 'string' && raw.trim()) payload.details[field.key] = normalizeUrl(raw)
    }
  }
  const errors = validateSubmission(payload, category)
  if (errors.length > 0) return Response.json({ ok: false, errors }, { status: 400 })

  try {
    const submission = await submitListingUpdate(community.slug, id, payload, null, { name: admin.email, email: admin.email })
    await approveSubmission(submission.id, community.slug, admin.email)
    const row = await getResourceRowById(id, community.slug)
    await revalidatePublicContent()
    after(() => runWalkRoutesAfterChange(community.slug))
    return Response.json({ ok: true, listing: row ? normalizeRow(row) : null })
  } catch (err) {
    console.error('[admin/listings/:id] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update the listing.'] }, { status: 502 })
  }
}

// DELETE /api/admin/listings/:id — archive it: off the site, and on Places'
// Archived to bring back.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/listings/[id]'>) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { id } = await ctx.params
  const current = await getResourceRowById(id, community.slug)
  if (!current || current.status !== 'approved') return Response.json({ ok: false, errors: ['That place isn’t on the site.'] }, { status: 404 })

  try {
    const submission = await submitListingDelete(community.slug, id, null, { name: admin.email, email: admin.email })
    await approveSubmission(submission.id, community.slug, admin.email)
    await revalidatePublicContent()
    after(() => runWalkRoutesAfterChange(community.slug))
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/listings/:id] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not archive the listing.'] }, { status: 502 })
  }
}
