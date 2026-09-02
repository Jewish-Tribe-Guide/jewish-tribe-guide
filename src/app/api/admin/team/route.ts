import { getAdminUserForCommunity } from '@/lib/adminAuth'
import {
  addCommunityAdminEmail,
  communitySlugFromRequest,
  getAdminNotifyPreference,
  getCommunityAdminEmails,
  resolveCommunity,
  setAdminNotifyPreference,
} from '@/lib/communityStore'

// GET /api/admin/team — this community's own admin login list, plus the
// signed-in admin's own notification preference (myNotify — never anyone
// else's; the Team tab only ever shows/edits the caller's own checkbox, see
// PATCH below). Gated by getAdminUserForCommunity (any of THIS community's
// own admins), not the superadmin-only check GET /api/admin/communities
// uses — a regular admin should be able to see who else has access to
// their own console.
export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  try {
    const [adminEmails, myNotify] = await Promise.all([
      getCommunityAdminEmails(community.slug),
      getAdminNotifyPreference(community.slug, admin.email),
    ])
    return Response.json({ ok: true, adminEmails, myNotify })
  } catch (err) {
    console.error('[admin/team] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the team list.'] }, { status: 502 })
  }
}

// PATCH /api/admin/team  body: { notify: boolean }
// Sets the SIGNED-IN admin's own notification preference — always
// admin.email from the verified token, never a client-supplied address, so
// this can only ever mute/unmute the caller's own inbox. Same auth as GET;
// no separate authorization needed since it's inherently self-only.
export async function PATCH(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  let body: { notify?: unknown }
  try {
    body = (await request.json()) as { notify?: unknown }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (typeof body.notify !== 'boolean') {
    return Response.json({ ok: false, errors: ['"notify" must be a boolean.'] }, { status: 400 })
  }

  try {
    await setAdminNotifyPreference(community.slug, admin.email, body.notify)
    return Response.json({ ok: true, myNotify: body.notify })
  } catch (err) {
    console.error('[admin/team] PATCH failed:', err)
    return Response.json({ ok: false, errors: ['Could not update your notification preference.'] }, { status: 502 })
  }
}

// POST /api/admin/team  body: { email }
// Adds one email to this community's admin allowlist. Same auth as GET —
// any of this community's own admins can grow their own team — but this is
// deliberately add-only (see addCommunityAdminEmail's own comment): there
// is no DELETE here. Removing someone is a superadmin-only action, from the
// full-list edit panel on /admin's Communities tab, so one admin can't lock
// another out (or themselves) via this endpoint.
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
