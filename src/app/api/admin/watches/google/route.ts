import { getAdminUserForCommunity } from '@/lib/adminAuth'
import { communitySlugFromRequest, resolveCommunity } from '@/lib/communityStore'
import { UUID } from '@/lib/itemMarkRoutes'
import { listCategories } from '@/lib/categoryStore'
import { getResourceById } from '@/lib/resourceStore'
import { enforceRateLimit } from '@/lib/rateLimit'
import { revalidatePublicContent } from '@/lib/revalidateContent'
import { googleCounts } from '@/lib/googleJob'
import {
  GoogleJobError,
  checkAgainstGoogle,
  editFromGoogle,
  findOnGoogle,
  keepTheListing,
  loadGoogleJob,
  notOnGoogle,
  pickGooglePlace,
  showAsOpen,
  applyGoogles,
} from '@/lib/googleJobRun'

// GET  /api/admin/watches/google — the Watches tab's Google page (Oct 22,
//      drawing 6gCnW6nVTDXySkcYENvAqF): every listing the morning's sync
//      covers, each field with who checks it (googleJobRun.ts). Nothing is
//      asked of Google here. `?counts`: only the Watches tab row's counts
//      and how many listings.
//      `?item=<id>`: one listing and its category, for Edit.
// POST — what the page does to one listing, `{ action, id, … }`:
//      check        Check against Google: one paid call; the fields that
//                   match become Google's, and its answer is kept.
//      find         Find it on Google, `query` optional: up to five places.
//      pick         `placeId`, one of those: its match, compared at once.
//      use          Use Google's: its version of each changed field, filed
//                   as Google Maps and approved, and Google keeps them.
//      keep         Keep the listing: nothing changes on it; you check what
//                   nothing else does, for good.
//      edit         `values` ({ name, hours, phone, website }), the
//                   listing's own edit as the admin left it.
//      not_on_google  said once; you check what nothing else does.
//      open         `open: true` Show as open over Google's closure;
//                   false, Google's answer again.
//      Admin only.

export const maxDuration = 60

/** Check, Find and a pick each make a paid call to Google. */
const PAID_LIMIT = { limit: 30, windowSec: 600 }

export async function GET(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })
  try {
    const params = new URL(request.url).searchParams
    const itemId = params.get('item')
    if (itemId !== null) {
      if (!UUID.test(itemId)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      const item = await getResourceById(itemId, community.slug)
      const category = item && (await listCategories(community.slug)).find((c) => c.id === item.category)
      if (!item || !category) return Response.json({ ok: false, errors: ['That place isn’t in this guide.'] }, { status: 404 })
      return Response.json({ ok: true, item, category })
    }
    const places = await loadGoogleJob(community.slug)
    if (params.has('counts')) return Response.json({ ok: true, counts: googleCounts(places), total: places.length })
    return Response.json({ ok: true, counts: googleCounts(places), places })
  } catch (err) {
    console.error('[admin/watches/google] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the listings.'] }, { status: 502 })
  }
}

const ACTIONS = ['check', 'find', 'pick', 'use', 'keep', 'edit', 'not_on_google', 'open'] as const
type Action = (typeof ACTIONS)[number]

export async function POST(request: Request) {
  const community = await resolveCommunity(communitySlugFromRequest(request))
  const admin = await getAdminUserForCommunity(request, community.slug)
  if (!admin) return Response.json({ ok: false, errors: ['Not authorized.'] }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const action = body?.action as Action
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!ACTIONS.includes(action) || !UUID.test(id)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
  if (action === 'check' || action === 'find' || action === 'pick') {
    const limited = await enforceRateLimit(request, 'admin-google-check', PAID_LIMIT)
    if (limited) return limited
  }

  const slug = community.slug
  try {
    if (action === 'find') {
      const query = typeof body?.query === 'string' ? body.query.slice(0, 200) : undefined
      return Response.json({ ok: true, found: await findOnGoogle(slug, id, query) })
    }
    let place
    if (action === 'check') place = await checkAgainstGoogle(slug, id)
    else if (action === 'pick') {
      const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : ''
      if (!placeId || placeId.length > 300) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      place = await pickGooglePlace(slug, id, placeId)
    } else if (action === 'use') place = await applyGoogles(slug, id, admin.email)
    else if (action === 'keep') place = await keepTheListing(slug, id)
    else if (action === 'not_on_google') place = await notOnGoogle(slug, id)
    else if (action === 'open') place = await showAsOpen(slug, id, body?.open === true)
    else {
      const values = body?.values
      if (!values || typeof values !== 'object' || Array.isArray(values)) return Response.json({ ok: false, errors: ['Invalid request.'] }, { status: 400 })
      place = await editFromGoogle(slug, id, values as Record<string, unknown>, admin.email)
    }
    // A check changes only what the sync reads, never what the site shows.
    if (action !== 'check') await revalidatePublicContent()
    return Response.json({ ok: true, place })
  } catch (err) {
    if (err instanceof GoogleJobError) return Response.json({ ok: false, errors: [err.message] }, { status: err.status })
    console.error('[admin/watches/google] POST failed:', err)
    return Response.json({ ok: false, errors: ['Could not save that.'] }, { status: 502 })
  }
}
