// ─────────────────────────────────────────────────────────────────────────────
// The /api/zmanim query string: what a client sends and what the route accepts.
//
// Shared by both sides so they can't drift. The route is unauthenticated and
// every cache miss fans out to four Hebcal requests, so it needs to refuse
// nonsense — and the clients need to send coordinates rounded the same way the
// route rounds them, or GPS jitter gives every visitor a distinct URL and the
// CDN/Data Cache never gets a hit.
// ─────────────────────────────────────────────────────────────────────────────

import { dayInTimezone } from './isoDay'

/** Two decimals is ~1.1 km. Sunset and candle-lighting move by seconds over
 *  that distance, and the card shows minutes. */
export const ZMANIM_COORD_DECIMALS = 2

export function roundZmanimCoord(n: number): number {
  const f = 10 ** ZMANIM_COORD_DECIMALS
  // +0 normalizes -0 (a point just south of the equator) to 0.
  return Math.round(n * f) / f + 0
}

/** Today's date (YYYY-MM-DD) in `timezone`. Sent with every zmanim request
 *  so the address differs each day: the CDN keeps an answer ten minutes,
 *  and without it, just after midnight, it could hand back yesterday's
 *  times for "today" (Nov 18 review, item 14). */
export function zmanimDate(now: number, timezone: string): string {
  return dayInTimezone(timezone, now)
}

/** The path + query a client should request for a location. */
export function zmanimPath(lat: number, lng: number, tzid?: string, date?: string): string {
  const q = `lat=${roundZmanimCoord(lat)}&lng=${roundZmanimCoord(lng)}`
  const day = date ? `&date=${date}` : ''
  return tzid ? `/api/zmanim?${q}&tzid=${encodeURIComponent(tzid)}${day}` : `/api/zmanim?${q}${day}`
}

/** Whether the server may let the CDN keep this answer: only when the date
 *  the client asked for is the server's own today there. A date that isn't
 *  (a clock a little off, either side of midnight) is answered for the
 *  server's today, uncached, so no day's address ever holds another day's
 *  times. A date that isn't a date is refused. */
export function zmanimDateCheck(params: URLSearchParams, timezone: string, now: number = Date.now()): 'cache' | 'no-store' | 'invalid' {
  const date = params.get('date')
  if (date === null) return 'cache'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'invalid'
  return date === zmanimDate(now, timezone) ? 'cache' : 'no-store'
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

// ── Batch: many locations in one round trip ─────────────────────────────────
//
// A screen listing many synagogues needs sunset/candle-lighting for each one's
// own coordinates. One request per location works but is a burst of round
// trips on first load; this asks for all of them at once. The single-location
// URL above stays as it is (one URL per spot is what makes it CDN-friendly),
// and the server side of a batch still reads through the same cached Hebcal
// fetches.

/** Upper bound on points per batch — each uncached point costs four Hebcal
 *  requests, so the route must not accept an unbounded list. */
export const ZMANIM_BATCH_MAX = 25

export type ZmanimPoint = { lat: number; lng: number }

/** Rounded, de-duplicated and sorted, so the same set of spots always yields
 *  the same URL regardless of the order or jitter they arrived in. */
export function canonicalZmanimPoints(points: ZmanimPoint[]): ZmanimPoint[] {
  const seen = new Map<string, ZmanimPoint>()
  for (const { lat, lng } of points) {
    const p = { lat: roundZmanimCoord(lat), lng: roundZmanimCoord(lng) }
    seen.set(`${p.lat},${p.lng}`, p)
  }
  return [...seen.values()].sort((a, b) => a.lat - b.lat || a.lng - b.lng)
}

export function zmanimBatchPath(points: ZmanimPoint[], tzid?: string, date?: string): string {
  const tz = tzid ? `&tzid=${encodeURIComponent(tzid)}` : ''
  return `/api/zmanim/batch?${canonicalZmanimPoints(points).map((p) => `p=${p.lat},${p.lng}`).join('&')}${tz}${date ? `&date=${date}` : ''}`
}

export type ParsedZmanimBatch =
  | { ok: true; points: ZmanimPoint[]; timezone: string }
  | { ok: false; error: string }

export function parseZmanimBatchRequest(params: URLSearchParams, defaultTimezone: string): ParsedZmanimBatch {
  const raw = params.getAll('p')
  if (raw.length === 0) return { ok: false, error: 'Missing p.' }
  if (raw.length > ZMANIM_BATCH_MAX) return { ok: false, error: `At most ${ZMANIM_BATCH_MAX} points.` }

  const points: ZmanimPoint[] = []
  for (const item of raw) {
    const [lat, lng, ...extra] = item.split(',')
    const latitude = extra.length === 0 ? parseCoord(lat ?? null, -90, 90) : null
    const longitude = extra.length === 0 ? parseCoord(lng ?? null, -180, 180) : null
    if (latitude === null || longitude === null) return { ok: false, error: 'Invalid p.' }
    points.push({ lat: latitude, lng: longitude })
  }

  const tz = params.get('tzid') ?? defaultTimezone
  if (!isValidTimezone(tz)) return { ok: false, error: 'Invalid tzid.' }
  return { ok: true, points: canonicalZmanimPoints(points), timezone: tz }
}
