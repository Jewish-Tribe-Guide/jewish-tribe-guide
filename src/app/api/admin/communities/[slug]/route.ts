import type { NextRequest } from 'next/server'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import {
  addCommunityAdminEmail,
  deleteCommunity,
  getCommunityAdminEmails,
  getCommunityNotifyOnSubmission,
  getCommunityNotifyPreferenceLists,
  getCommunityPreviewToken,
  removeCommunityAdminEmail,
  setCommunityEmailLists,
  setCommunityVisibility,
} from '@/lib/communityStore'

function asEmailList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((e): e is string => typeof e === 'string' && e.trim().length > 0).map((e) => e.trim())
}

// PATCH /api/admin/communities/:slug
//   body: { visible?, adminEmails?, notifyOnSubmission?, addAdminEmail?, removeAdminEmail? }
// Any subset — publishes/unpublishes (see the visibility migration's own
// comment), updates the admin login allowlist wholesale (adminEmails) or one
// address at a time (addAdminEmail/removeAdminEmail — what the superadmin
// console's per-community admin roster actually uses; adminEmails' full
// replace stays for anything else that wants it), and/or the
// notify-on-submission toggle (see the admin_emails migration's own
// comment). Superadmin only, same as everything else in this file. Unlike
// DELETE below, this IS available in production — publishing a
// built-out-but-hidden community, or fixing who can sign in to it, are both
// routine admin actions.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/admin/communities/[slug]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const { slug } = await ctx.params

  let body: {
    visible?: unknown
    adminEmails?: unknown
    notifyOnSubmission?: unknown
    addAdminEmail?: unknown
    removeAdminEmail?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }

  const hasVisible = body.visible !== undefined
  if (hasVisible && typeof body.visible !== 'boolean') {
    return Response.json({ ok: false, errors: ['"visible" must be a boolean.'] }, { status: 400 })
  }
  const hasNotify = body.notifyOnSubmission !== undefined
  if (hasNotify && typeof body.notifyOnSubmission !== 'boolean') {
    return Response.json({ ok: false, errors: ['"notifyOnSubmission" must be a boolean.'] }, { status: 400 })
  }
  const adminEmails = asEmailList(body.adminEmails)
  const hasAddAdmin = body.addAdminEmail !== undefined
  if (hasAddAdmin && (typeof body.addAdminEmail !== 'string' || !body.addAdminEmail.trim())) {
    return Response.json({ ok: false, errors: ['"addAdminEmail" must be a non-empty string.'] }, { status: 400 })
  }
  const hasRemoveAdmin = body.removeAdminEmail !== undefined
  if (hasRemoveAdmin && (typeof body.removeAdminEmail !== 'string' || !body.removeAdminEmail.trim())) {
    return Response.json({ ok: false, errors: ['"removeAdminEmail" must be a non-empty string.'] }, { status: 400 })
  }
  if (!hasVisible && adminEmails === undefined && !hasNotify && !hasAddAdmin && !hasRemoveAdmin) {
    return Response.json({ ok: false, errors: ['Nothing to update.'] }, { status: 400 })
  }

  try {
    let community = null
    let previewToken: string | null = null
    if (hasVisible) {
      const result = await setCommunityVisibility(slug, body.visible as boolean)
      community = result.community
      previewToken = result.previewToken
    }
    if (adminEmails !== undefined || hasNotify) {
      community = await setCommunityEmailLists(slug, {
        adminEmails,
        notifyOnSubmission: hasNotify ? (body.notifyOnSubmission as boolean) : undefined,
      })
    }
    if (hasAddAdmin) await addCommunityAdminEmail(slug, body.addAdminEmail as string)
    if (hasRemoveAdmin) await removeCommunityAdminEmail(slug, body.removeAdminEmail as string)

    // Publishing/unpublishing changes the public switcher and sitemap
    // immediately, same as any other public-content admin save. The email
    // lists aren't public content, but revalidating unconditionally is
    // cheap and keeps this one code path instead of two.
    await revalidatePublicContent()

    // adminEmails/notifyOnSubmission/notifyMutedEmails/notifyReviewEmails/
    // previewToken ride along here (superadmin-only route) so the client can
    // sync its state right away regardless of which fields this call
    // actually touched — unpublishing rotates the token, for instance, so
    // re-reading it beats trusting whatever the client already had.
    const [freshAdminEmails, freshNotifyOnSubmission, freshNotifyPreferenceLists, freshPreviewToken] =
      await Promise.all([
        getCommunityAdminEmails(slug),
        getCommunityNotifyOnSubmission(slug),
        getCommunityNotifyPreferenceLists(slug),
        previewToken === null ? getCommunityPreviewToken(slug) : Promise.resolve(previewToken),
      ])
    return Response.json({
      ok: true,
      community: {
        ...community,
        adminEmails: freshAdminEmails,
        notifyOnSubmission: freshNotifyOnSubmission,
        notifyMutedEmails: freshNotifyPreferenceLists.notifyMutedEmails,
        notifyReviewEmails: freshNotifyPreferenceLists.notifyReviewEmails,
        previewToken: freshPreviewToken,
      },
    })
  } catch (err) {
    console.error('[admin/communities/:slug] PATCH failed:', err)
    const message = err instanceof Error ? err.message : 'Could not update the community.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}

// DELETE /api/admin/communities/:slug  body: { confirmSlug: string }
// Permanently deletes a community and everything in it. Superadmin only —
// same as creating one (see /api/admin/communities/route.ts's own note on
// what that means now).
//
// Two things stand between a stray request and a real deletion, on top of
// the auth check itself:
//   1. Refused outright against real production (VERCEL_ENV === 'production'
//      — same signal src/instrumentation.ts's Sentry gate and email.ts's
//      adminAppUrl already use for "is this actually the live site"). This
//      is genuinely destructive and irreversible, unlike everything else
//      superadmin can do here — creating a community is easy to undo by
//      deleting it again, but there's no undo for this. Local dev and
//      preview deployments are unaffected.
//   2. `confirmSlug` must equal the URL's own `:slug` — the client's
//      "retype the community's slug" confirmation step round-tripped back
//      here, so a delete can't go through on a stale UI state or a bare
//      curl call that only got the URL right.
export async function DELETE(request: NextRequest, ctx: RouteContext<'/api/admin/communities/[slug]'>) {
  const admin = await getAdminUser(request)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  if (process.env.VERCEL_ENV === 'production') {
    return Response.json(
      { ok: false, errors: ['Deleting a community is not available in production.'] },
      { status: 403 },
    )
  }

  const { slug } = await ctx.params

  let body: { confirmSlug?: string }
  try {
    body = (await request.json()) as { confirmSlug?: string }
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (body.confirmSlug !== slug) {
    return Response.json({ ok: false, errors: ['Confirmation did not match.'] }, { status: 400 })
  }

  try {
    await deleteCommunity(slug)
    // The community's own directory (and, for everyone else, the updated
    // communities list) is public content — drop the cache so its removal
    // shows up immediately instead of waiting out cacheLife('days').
    await revalidatePublicContent()
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/communities/:slug] DELETE failed:', err)
    const message = err instanceof Error ? err.message : 'Could not delete community.'
    return Response.json({ ok: false, errors: [message] }, { status: 502 })
  }
}
