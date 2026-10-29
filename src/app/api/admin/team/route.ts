import { getAdminUserForCommunity } from '@/lib/adminAuth'
import {
  addCommunityAdminEmail,
  removeCommunityAdminEmail,
  communitySlugFromRequest,
  getAdminNotifyPreference,
  getAdminReviewNotifyPreference,
  getCommunityAdminEmails,
  resolveCommunity,
  setAdminNotifyPreference,
  setAdminReviewNotifyPreference,
} from '@/lib/communityStore'

// GET /api/admin/team — this community's own admin login list, plus the
// signed-in admin's own two notification preferences (myNotify,
// myReviewNotify — never anyone else's; the Team tab only ever shows/edits
// the caller's own checkboxes, see PATCH below). Gated by
// getAdminUserForCommunity (any of THIS community's own admins), not the
// superadmin-only check GET /api/admin/communities uses — a regular admin
// should be able to see who else has access to their own console.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [adminEmails, myNotify, myReviewNotify] = await Promise.all([
      getCommunityAdminEmails(community.slug),
      getAdminNotifyPreference(community.slug, admin.email),
      getAdminReviewNotifyPreference(community.slug, admin.email),
    ])
    return Response.json({ ok: true, adminEmails, myNotify, myReviewNotify })
  } catch (err) {
    console.error('[admin/team] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the team list.'] }, { status: 502 })
  }
}

// PATCH /api/admin/team  body: { notify?: boolean; reviewNotify?: boolean }
// Sets one or both of the SIGNED-IN admin's own notification preferences —
// always admin.email from the verified token, never a client-supplied
// address, so this can only ever change the caller's own preferences.
// Same auth as GET; no separate authorization needed since it's inherently
// self-only. At least one field is required; either can be given alone so
// the Team tab's two checkboxes can each PATCH independently without
// clobbering the other.
export async function PATCH(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { notify?: unknown; reviewNotify?: unknown }
  try {
    body = (await request.json()) as { notify?: unknown; reviewNotify?: unknown }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  const hasNotify = typeof body.notify === 'boolean'
  const hasReviewNotify = typeof body.reviewNotify === 'boolean'
  if (!hasNotify && !hasReviewNotify) {
    return Response.json({ ok: false, errors: ['"notify" or "reviewNotify" must be a boolean.'] }, { status: 400 })
  }

  try {
    if (hasNotify) await setAdminNotifyPreference(community.slug, admin.email, body.notify as boolean)
    if (hasReviewNotify) await setAdminReviewNotifyPreference(community.slug, admin.email, body.reviewNotify as boolean)
    const [myNotify, myReviewNotify] = await Promise.all([
      getAdminNotifyPreference(community.slug, admin.email),
      getAdminReviewNotifyPreference(community.slug, admin.email),
    ])
    return Response.json({ ok: true, myNotify, myReviewNotify })
  } catch (err) {
    console.error('[admin/team] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update your notification preference.'] }, { status: 502 })
  }
}

// POST /api/admin/team  body: { email }
// Adds one email to this community's admin allowlist. Same auth as GET —
// any of this community's own admins can grow their own team.
export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { email?: unknown }
  try {
    body = (await request.json()) as { email?: unknown }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  // A shape check, not real validation — same low bar the rest of this app
  // holds a typed email to (see validateContact). Supabase itself will
  // refuse to ever sign this address in if it isn't real.
  if (!email || !email.includes('@')) {
    return Response.json({ ok: false, errors: ['A valid email is required.'] }, { status: 400 })
  }

  try {
    const adminEmails = await addCommunityAdminEmail(community.slug, email)
    return Response.json({ ok: true, adminEmails })
  } catch (err) {
    console.error('[admin/team] POST failed:', err)
    const message = err instanceof Error ? err.message : 'Could not add that email.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}

// DELETE /api/admin/team  body: { email }
// Takes one email off this community's admin allowlist (the admin redesign's
// step 5: Team has one list, add and remove, in place of the site owner's
// Communities tab). Same auth as GET. Never the caller's own address: no one
// can lock themselves out by mistake, and the last admin can't leave the
// list empty.
export async function DELETE(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { email?: unknown }
  try {
    body = (await request.json()) as { email?: unknown }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email) return Response.json({ ok: false, errors: ['An email is required.'] }, { status: 400 })
  if (email.toLowerCase() === admin.email.trim().toLowerCase()) {
    return Response.json({ ok: false, errors: ['You can’t remove yourself.'] }, { status: 400 })
  }

  try {
    const adminEmails = await removeCommunityAdminEmail(community.slug, email)
    return Response.json({ ok: true, adminEmails })
  } catch (err) {
    console.error('[admin/team] DELETE failed:', err)
    return Response.json({ ok: false, errors: ['Could not remove that admin.'] }, { status: 502 })
  }
}
