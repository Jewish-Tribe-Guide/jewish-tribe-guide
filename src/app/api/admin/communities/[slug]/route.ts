import type { NextRequest } from 'next/server'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { getAdminUser } from '@/lib/adminAuth'
import { deleteCommunity } from '@/lib/communityStore'

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
