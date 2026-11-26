import tzLookup from 'tz-lookup'
import { siteAdminRead } from '@/lib/adminRoute'
import { findCity, suggestCities } from '@/lib/googleCities'

// GET /api/admin/cities?q=Balti — New community's city suggestions.
// GET /api/admin/cities?placeId=… — the one picked: its name, state, centre
// and time zone. The site owner's only (siteAdminRead), like creating a
// community; every lookup is a Google call billed to the site.
export const GET = siteAdminRead(async (request: Request) => {
  const params = new URL(request.url).searchParams
  const placeId = params.get('placeId')
  if (placeId) {
    const city = await findCity(placeId)
    if (!city) return Response.json({ ok: false, errors: ['Google couldn’t find that city. Try again.'] }, { status: 502 })
    return Response.json({ ok: true, city: { ...city, timezone: tzLookup(city.lat, city.lng) } })
  }
  const cities = await suggestCities(params.get('q') ?? '')
  if (!cities) return Response.json({ ok: false, errors: ['Google isn’t answering. Try again.'] }, { status: 502 })
  return Response.json({ ok: true, cities })
})
