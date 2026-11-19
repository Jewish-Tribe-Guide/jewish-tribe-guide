import { adminRead, adminWrite } from '@/lib/adminRoute'
import { getCommunityDefaultLocation, setCommunityDefaultLocation } from '@/lib/communityStore'

// Settings › Default location (Nov 19): where a visitor is taken to be until
// they set their own location — distances, the home's zmanim, where the map
// opens. Starts as the city picked when the community was made; any of the
// community's own admins can move it, since they know its neighbourhoods
// and a superadmin doesn't.

// GET /api/admin/default-location — what it is now, uncached.
export const GET = adminRead(async (_request: Request, { community }) => {
  try {
    const location = await getCommunityDefaultLocation(community.slug)
    if (!location) return Response.json({ ok: false, errors: ['No such community.'] }, { status: 404 })
    return Response.json({ ok: true, ...location })
  } catch (err) {
    console.error('[admin/default-location] GET failed:', err)
    return Response.json({ ok: false, errors: ['Could not load the default location.'] }, { status: 502 })
  }
})

// PUT /api/admin/default-location  body: { lat, lng, label }
// The time zone follows the place; the community's name and region stay.
export const PUT = adminWrite(async (request: Request, { community }) => {
  let body: { lat?: unknown; lng?: unknown; label?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 })
  }
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number' || typeof body.label !== 'string') {
    return Response.json({ ok: false, errors: ['Pick a place from the list.'] }, { status: 400 })
  }

  try {
    // The wrapper refreshes the public site after it: every public screen
    // reads the community (its layout), and the communities list is cached
    // for days.
    const saved = await setCommunityDefaultLocation(community.slug, { lat: body.lat, lng: body.lng, label: body.label })
    return Response.json({ ok: true, ...saved })
  } catch (err) {
    if (err instanceof RangeError) return Response.json({ ok: false, errors: [err.message] }, { status: 400 })
    console.error('[admin/default-location] PUT failed:', err)
    return Response.json({ ok: false, errors: ['Could not save the default location.'] }, { status: 502 })
  }
})
