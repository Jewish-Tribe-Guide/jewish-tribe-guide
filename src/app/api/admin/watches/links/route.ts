import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { checkOneLink, linkStandings } from '@/lib/linkCheckRun'

// GET  /api/admin/watches/links — every link a listing shows that the
//      weekly link check opens (linkCheck.ts), and how it last answered,
//      for the Watches tab: one that doesn't open is Not checked on its
//      place's row, and What's tracked lists them all. Nothing is opened.
// POST /api/admin/watches/links {action:'check', resourceId, key} — Check
//      it again: opens that one link now, after an admin has fixed it, say.
// Admin only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  try {
    return Response.json({ ok: true, links: await linkStandings(community.slug) })
  } catch (err) {
    console.error('[admin/watches/links] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the links.'] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { action?: unknown; resourceId?: unknown; key?: unknown } | null
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : ''
  const key = typeof body?.key === 'string' ? body.key : ''
  if (body?.action !== 'check' || !UUID.test(resourceId) || !/^[\w-]{1,64}$/.test(key)) return Response.json({ ok: false, errors: ['Say which link to check.'] }, { status: 400 })
  try {
    const link = await checkOneLink(community.slug, resourceId, key)
    if (!link) return Response.json({ ok: false, errors: ['That listing has no such link to check.'] }, { status: 404 })
    return Response.json({ ok: true, link })
  } catch (err) {
    console.error('[admin/watches/links] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not check the link.'] }, { status: 502 })
  }
}
