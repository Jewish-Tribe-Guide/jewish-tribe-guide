import { validateSubmission, getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { getCategoryById } from '@/lib/categoryStore'
import { submitListingCreate, approveSubmission } from '@/lib/submissionStore'
import { normalizeUrl } from '@/lib/validation'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import type { ResourceSubmission } from '@/types'

type Body = {
  payload?: ResourceSubmission
}

// POST /api/admin/listings — an admin adds a listing directly, live, with no
// moderation queue and no Turnstile/honeypot: this path is already behind
// real admin auth, unlike the public /api/submissions. Create-only — editing
// an existing listing still goes through the normal submit+approve flow.
//
// Reuses the real submission pipeline's own work (validation, geocoding,
// Google-sync field ownership) rather than re-implementing it: this inserts a
// normal pending submission via submitListingCreate, then immediately calls
// approveSubmission — the exact function the moderation queue's own approve
// action calls — so every side effect of a real approval happens here too.
export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  const payload = body.payload
  if (!payload) {
    return Response.json({ ok: false, errors: ['Missing listing details.'] }, { status: 400 })
  }

  const category = await getCategoryById(community.slug, payload.category)

  // Same "add https:// before validating/storing" normalization
  // /api/submissions does — see that route's own comment.
  if (payload.details) {
    for (const field of category?.detailFields ?? []) {
      if (field.type !== 'url') continue
      const raw = payload.details[field.key]
      if (typeof raw === 'string' && raw.trim()) payload.details[field.key] = normalizeUrl(raw)
    }
  }

  const errors = validateSubmission(payload, category)
  if (errors.length > 0) {
    return Response.json({ ok: false, errors }, { status: 400 })
  }

  try {
    const submission = await submitListingCreate(community.slug, {
      ...payload,
      submittedBy: { name: admin.email, email: admin.email },
    })
    const approved = await approveSubmission(submission.id, community.slug, admin.email)
    const resourceRow = approved.target_id ? await getResourceRowById(approved.target_id, community.slug) : null
    if (!resourceRow) {
      return Response.json({ ok: false, errors: ['Listing was created but could not be loaded.'] }, { status: 502 })
    }
    // The public site caches this content; drop it so the new listing shows up.
    await revalidatePublicContent()
    return Response.json({ ok: true, listing: normalizeRow(resourceRow) })
  } catch (err) {
    console.error('[admin/listings] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not add listing.'] }, { status: 502 })
  }
}
