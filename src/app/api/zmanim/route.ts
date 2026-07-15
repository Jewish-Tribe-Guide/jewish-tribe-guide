import { community } from '@/community.config'
import { getZmanimData } from '@/lib/zmanim'

// GET /api/zmanim?lat=39.9526&lng=-75.1652&tzid=America%2FNew_York
//
// Accepts raw coordinates (the visitor's address, or the community's center) and
// fetches zmanim from Hebcal server-side, returning a normalized payload for the
// Zmanim & Shabbos card. The timezone defaults to the community's configured tz.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  if (!latParam || !lngParam) {
    return Response.json({ ok: false, error: 'Missing lat/lng.' }, { status: 400 })
  }
  const latitude = parseFloat(latParam)
  const longitude = parseFloat(lngParam)
  if (isNaN(latitude) || isNaN(longitude)) {
    return Response.json({ ok: false, error: 'Invalid lat/lng.' }, { status: 400 })
  }

  const timezone = searchParams.get('tzid') ?? community.timezone
  try {
    const data = await getZmanimData({ latitude, longitude, timezone })
    return Response.json({ ok: true, data })
  } catch (err) {
    console.error('[zmanim] fetch failed:', err)
    return Response.json({ ok: false, error: 'Could not load zmanim right now.' }, { status: 502 })
  }
}
