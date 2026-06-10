import { hospitals } from '@/data/hospitals'
import { getZmanimData } from '@/lib/zmanim'

// GET /api/zmanim?hospitalId=penn
//   OR
// GET /api/zmanim?lat=39.9526&lng=-75.1652&tzid=America%2FNew_York
//
// The first form resolves a hospital's coordinates from the hospitals list.
// The second form accepts raw coordinates (address-anchor / community mode).
// In both cases, fetches zmanim from Hebcal server-side and returns a normalized
// payload for the Zmanim & Shabbos card.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // ── Address-anchor mode: caller supplies lat/lng directly ────────────────
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  if (latParam && lngParam) {
    const latitude = parseFloat(latParam)
    const longitude = parseFloat(lngParam)
    if (isNaN(latitude) || isNaN(longitude)) {
      return Response.json({ ok: false, error: 'Invalid lat/lng.' }, { status: 400 })
    }
    const timezone = searchParams.get('tzid') ?? 'America/New_York'
    try {
      const data = await getZmanimData({ latitude, longitude, timezone })
      return Response.json({ ok: true, data })
    } catch (err) {
      console.error('[zmanim] fetch failed (address mode):', err)
      return Response.json({ ok: false, error: 'Could not load zmanim right now.' }, { status: 502 })
    }
  }

  // ── Hospital mode: look up coordinates by hospitalId ─────────────────────
  const hospitalId = searchParams.get('hospitalId')
  const hospital = hospitals.find((h) => h.id === hospitalId)
  if (!hospital) {
    return Response.json({ ok: false, error: 'Unknown hospital.' }, { status: 400 })
  }

  try {
    const data = await getZmanimData({
      latitude: hospital.latitude,
      longitude: hospital.longitude,
      timezone: hospital.timezone,
    })
    return Response.json({ ok: true, data })
  } catch (err) {
    console.error('[zmanim] fetch failed:', err)
    return Response.json(
      { ok: false, error: 'Could not load zmanim right now.' },
      { status: 502 },
    )
  }
}
