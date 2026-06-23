// Google Places (legacy web-service) wrappers + a mapper from Google's opening
// hours into this app's structured-hours shape. Server-side only — uses the
// non-referrer-restricted GOOGLE_MAPS_SERVER_KEY (the same key that already
// powers server geocoding and the Distance Matrix travel-time backfill).
//
// Two operations:
//   • findPlaceId(name, address) — one-time, resolves a stable Google place id.
//   • fetchPlaceSync(placeId)    — recurring, pulls current hours/phone/address
//                                  /business status for the auto-sync job.
//
// The legacy `/maps/api/place/*` endpoints are used (not Places API "New") for
// consistency with geo.ts / travelTime.ts, which already call the legacy
// maps.googleapis.com web services with this key.

import type { DayKey, StructuredHours } from './hours'
import { DAY_KEYS } from './hours'

export type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'

/** What a single sync pulls back from Google for one listing. Any field may be
 *  null when Google doesn't have it (e.g. a place with no posted hours). */
export type PlaceSync = {
  hours: StructuredHours | null
  phone: string | null
  /** Google's formatted address. The sync only fills this in when the listing
   *  has none — it never overwrites a curated address (that would desync `geo`). */
  address: string | null
  businessStatus: BusinessStatus | null
  /** Google's editorial summary (short human-readable description). */
  description: string | null
}

function serverKey(): string | null {
  // Mirror geo.ts: prefer the Maps server key, fall back to the geocoding key.
  return process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY ?? null
}

// ── Find Place id ───────────────────────────────────────────────────────────

/**
 * Resolves a Google place id from a name + address. Used once, by the place-id
 * backfill. Returns null if Google can't confidently match the query (callers
 * should log these for manual review). Server-side only.
 */
export async function findPlaceId(name: string, address: string): Promise<string | null> {
  const key = serverKey()
  if (!key) return null
  const input = [name, address].filter(Boolean).join(', ').trim()
  if (!input) return null
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(input)}&inputtype=textquery&fields=place_id&key=${key}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { status: string; candidates?: { place_id?: string }[] }
    if (data.status !== 'OK' || !data.candidates?.[0]?.place_id) return null
    return data.candidates[0].place_id
  } catch {
    return null
  }
}

// ── Place Details (the recurring sync) ──────────────────────────────────────

type GooglePeriodEndpoint = { day: number; time: string } // time is "HHMM"
type GooglePeriod = { open: GooglePeriodEndpoint; close?: GooglePeriodEndpoint }
type GoogleOpeningHours = { periods?: GooglePeriod[] }
type GooglePlaceResult = {
  business_status?: string
  formatted_phone_number?: string
  formatted_address?: string
  opening_hours?: GoogleOpeningHours
  editorial_summary?: { overview?: string }
}

/**
 * Fetches current hours/phone/address/status for a known place id. Returns null
 * on any failure (network, bad status, place id gone) so the caller can skip
 * the listing and leave its existing data untouched. Server-side only.
 */
export async function fetchPlaceSync(placeId: string): Promise<PlaceSync | null> {
  const key = serverKey()
  if (!key) return null
  try {
    const fields = 'business_status,formatted_phone_number,formatted_address,opening_hours,editorial_summary'
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${key}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { status: string; result?: GooglePlaceResult }
    if (data.status !== 'OK' || !data.result) return null
    const r = data.result
    return {
      hours: googleHoursToStructured(r.opening_hours),
      phone: r.formatted_phone_number ?? null,
      address: r.formatted_address ?? null,
      businessStatus: normalizeBusinessStatus(r.business_status),
      description: r.editorial_summary?.overview ?? null,
    }
  } catch {
    return null
  }
}

function normalizeBusinessStatus(v: string | undefined): BusinessStatus | null {
  if (v === 'OPERATIONAL' || v === 'CLOSED_TEMPORARILY' || v === 'CLOSED_PERMANENTLY') return v
  return null
}

// ── Hours mapping ───────────────────────────────────────────────────────────

/** "HHMM" (Google) → "HH:MM" (this app's structured-hours format). */
function hhmm(time: string): string {
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`
}

/**
 * Maps Google's `opening_hours.periods` to this app's StructuredHours
 * ({ sun: { open, close } | null, … }). Returns null when Google has no hours
 * at all, so the caller leaves the listing's existing hours untouched rather
 * than blanking them.
 *
 * Approximations (StructuredHours stores one open/close range per day):
 *   • 24-hour places (a single open period with no close) → every day 00:00–23:59.
 *   • Split hours within a day (e.g. lunch break) collapse to the earliest open
 *     and latest close of that day.
 *   • A period that closes after midnight is attributed to its open day and
 *     capped at 23:59.
 */
export function googleHoursToStructured(oh: GoogleOpeningHours | undefined): StructuredHours | null {
  const periods = oh?.periods
  if (!periods || periods.length === 0) return null

  // Open 24/7: Google returns one period, open day 0 time "0000", no close.
  if (periods.length === 1 && !periods[0].close && periods[0].open.time === '0000') {
    const allDay: StructuredHours = {}
    for (const key of DAY_KEYS) allDay[key] = { open: '00:00', close: '23:59' }
    return allDay
  }

  const result: StructuredHours = {}
  // Days absent from `result` mean "closed" downstream, so start every day closed.
  for (const key of DAY_KEYS) result[key] = null

  for (const p of periods) {
    const dayIdx = p.open.day
    if (dayIdx < 0 || dayIdx > 6) continue
    const key: DayKey = DAY_KEYS[dayIdx]
    const open = hhmm(p.open.time)
    // No close, or close rolls into another day → cap at end of the open day.
    const close = !p.close || p.close.day !== dayIdx ? '23:59' : hhmm(p.close.time)

    const existing = result[key]
    if (!existing) {
      result[key] = { open, close }
    } else {
      // Split hours: widen to the earliest open / latest close of the day.
      result[key] = {
        open: open < existing.open ? open : existing.open,
        close: close > existing.close ? close : existing.close,
      }
    }
  }

  return result
}
