import { hospitals } from '@/data/hospitals'
import { getZmanimData } from '@/lib/zmanim'

// GET /api/zmanim?hospitalId=penn
// Resolves the hospital's coordinates, fetches zmanim from Hebcal server-side,
// and returns a normalized payload for the Zmanim & Shabbos card.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
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
