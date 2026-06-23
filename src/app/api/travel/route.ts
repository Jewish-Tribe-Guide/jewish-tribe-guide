// POST /api/travel
// Computes driving + walking minutes from a single origin to a set of listing
// coordinates. Used by the community tab (address anchor) so listings can
// display 🚗 / 🚶 times just like the patient tab's precomputed times.
//
// Body: { origin: { lat, lng }, destinations: { id, lat, lng }[] }
// Response: { ok: true, results: Record<id, { drive?, walk? }> }
//         | { ok: false, error: string }

import { NextRequest, NextResponse } from 'next/server'
import { computeTravelTimesFrom } from '@/lib/travelTime'
import { enforceRateLimit } from '@/lib/rateLimit'
import { LIMITS } from '@/lib/limits'
import type { LatLng } from '@/lib/geo'

type Destination = { id: string; lat: number; lng: number }

type RequestBody = {
  origin: LatLng
  destinations: Destination[]
}

export async function POST(req: NextRequest) {
  // Each destination is a paid Google lookup — throttle and bound the array.
  const limited = await enforceRateLimit(req, 'travel', { limit: 20, windowSec: 60 })
  if (limited) return limited

  try {
    const body = (await req.json()) as RequestBody
    const { origin, destinations } = body

    if (
      typeof origin?.lat !== 'number' ||
      typeof origin?.lng !== 'number' ||
      !Array.isArray(destinations)
    ) {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
    }

    if (destinations.length > LIMITS.travelDestinations) {
      return NextResponse.json(
        { ok: false, error: 'Too many destinations in one request.' },
        { status: 413 },
      )
    }

    const results = await computeTravelTimesFrom(origin, destinations)
    return NextResponse.json({ ok: true, results })
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
