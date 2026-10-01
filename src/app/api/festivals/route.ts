import { community } from '@/community.config'
import { enforceRateLimit } from '@/lib/rateLimit'
import { dayInTimezone } from '@/lib/activity'
import { festivalsFrom } from '@/lib/festivals'

// GET /api/festivals — the festivals from now to a year ahead (step 4):
// "Sukkos 5787, Sep 26 – Oct 4", each day named, for starting a shul's
// special schedule without typing dates. One Hebcal request, shared at the
// CDN by everyone: the answer changes only when a festival ends.

const CACHE_CONTROL = 'public, max-age=0, s-maxage=21600'
const HEBCAL = 'https://www.hebcal.com/hebcal'

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'festivals', { limit: 30, windowSec: 60 })
  if (limited) return limited

  const today = dayInTimezone(community.timezone, new Date())
  // From two weeks back, so a festival already under way is whole.
  const start = dayInTimezone(community.timezone, new Date(Date.now() - 14 * 86_400_000))
  const end = dayInTimezone(community.timezone, new Date(Date.now() + 400 * 86_400_000))
  const url = `${HEBCAL}?cfg=json&v=1&start=${start}&end=${end}&maj=on&min=off&mod=off&s=off&mf=off&nx=off&ss=off&c=off&i=off`
  try {
    const res = await fetch(url, { next: { revalidate: 21600 } } as RequestInit)
    if (!res.ok) throw new Error(`Hebcal ${res.status}`)
    const body = (await res.json()) as { items?: { category: string; title: string; date: string; hdate?: string }[] }
    const festivals = festivalsFrom(body.items ?? []).filter((f) => f.to >= today)
    return Response.json({ ok: true, festivals }, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (err) {
    console.error('[festivals] fetch failed:', err)
    return Response.json({ ok: false, error: 'Could not load the calendar right now.' }, { status: 502 })
  }
}
