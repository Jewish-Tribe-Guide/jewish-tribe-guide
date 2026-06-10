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
import type { LatLng } from '@/lib/geo'

type Destination = { id: string; lat: number; lng: number }

type RequestBody = {
  origin: LatLng
  destinations: Destination[]
}

export async function POST(req: NextRequest) {
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

    const results = await computeTravelTimesFrom(origin, destinations)
    return NextResponse.json({ ok: true, results })
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
