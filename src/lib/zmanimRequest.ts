// ─────────────────────────────────────────────────────────────────────────────
// The /api/zmanim query string: what a client sends and what the route accepts.
//
// Shared by both sides so they can't drift. The route is unauthenticated and
// every cache miss fans out to four Hebcal requests, so it needs to refuse
// nonsense — and the clients need to send coordinates rounded the same way the
// route rounds them, or GPS jitter gives every visitor a distinct URL and the
// CDN/Data Cache never gets a hit.
// ─────────────────────────────────────────────────────────────────────────────

/** Two decimals is ~1.1 km. Sunset and candle-lighting move by seconds over
 *  that distance, and the card shows minutes. */
export const ZMANIM_COORD_DECIMALS = 2

export function roundZmanimCoord(n: number): number {
  const f = 10 ** ZMANIM_COORD_DECIMALS
  // +0 normalizes -0 (a point just south of the equator) to 0.
  return Math.round(n * f) / f + 0
}

/** The path + query a client should request for a location. */
export function zmanimPath(lat: number, lng: number, tzid?: string): string {
  const q = `lat=${roundZmanimCoord(lat)}&lng=${roundZmanimCoord(lng)}`
  return tzid ? `/api/zmanim?${q}&tzid=${encodeURIComponent(tzid)}` : `/api/zmanim?${q}`
}

function isValidTimezone(tz: string): boolean {
  // Length cap first: this string is forwarded to a third party.
  if (tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export type ParsedZmanimRequest =
  | { ok: true; latitude: number; longitude: number; timezone: string }
  | { ok: false; error: string }

/** Strict on purpose: `parseFloat('12abc')` is 12, and it accepts 'Infinity'. */
function parseCoord(raw: string | null, min: number, max: number): number | null {
  if (raw === null || !/^-?\d+(\.\d+)?$/.test(raw.trim())) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}

export function parseZmanimRequest(params: URLSearchParams, defaultTimezone: string): ParsedZmanimRequest {
  const lat = params.get('lat')
  const lng = params.get('lng')
  if (lat === null || lng === null) return { ok: false, error: 'Missing lat/lng.' }

  const latitude = parseCoord(lat, -90, 90)
  const longitude = parseCoord(lng, -180, 180)
  if (latitude === null || longitude === null) return { ok: false, error: 'Invalid lat/lng.' }

  const tz = params.get('tzid') ?? defaultTimezone
  if (!isValidTimezone(tz)) return { ok: false, error: 'Invalid tzid.' }

  return {
    ok: true,
    latitude: roundZmanimCoord(latitude),
    longitude: roundZmanimCoord(longitude),
    timezone: tz,
  }
}
