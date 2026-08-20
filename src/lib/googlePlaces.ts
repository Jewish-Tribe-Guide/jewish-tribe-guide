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
  /** Google's current name for the place. Only written when the sync owns the
   *  name field — see OWNABLE_SYNC_FIELDS. */
  name: string | null
  hours: StructuredHours | null
  phone: string | null
  /** Google's formatted address. The sync only fills this in when the listing
   *  has none — it never overwrites a curated address (that would desync `geo`). */
  address: string | null
  /** Only written when the sync owns the category's Website field — see
   *  OWNABLE_SYNC_FIELDS. Matched to a listing's own Website detail field by
   *  label, same convention as ListingForm.tsx's intake autofill (categories
   *  predate a fixed key convention for this one). */
  website: string | null
  businessStatus: BusinessStatus | null
  /** Google's editorial summary (short human-readable description). */
  description: string | null
}

function serverKey(): string | null {
  // Mirror geo.ts: prefer the Maps server key, fall back to the geocoding key.
  return process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.GOOGLE_GEOCODING_API_KEY ?? null
}

// ── Field ownership ─────────────────────────────────────────────────────────
//
// Some listing data is curated by a person and some is whatever Google had.
// The sync must only ever refresh the second kind: a local phone number an
// editor typed in shouldn't be replaced by a chain's toll-free call centre, and
// hours corrected by hand shouldn't be reverted by Google's (sometimes wrong)
// posted hours.
//
// The rule is provenance, tracked per field, decided once at approval time
// (submissionStore.ts's resolveGoogleFields): a field is Google's if what's
// being approved for it actually matches what Google has. Match (or the
// field is empty) → Google's, refreshed forever. Differs → the submitter's,
// never touched. The comparison itself is cheap for the common case — the
// form already captures what picking an address autofilled (see
// ListingForm.tsx's `googleAutofill`), so most fields are checked against
// that for free; only a field that's new/changed AND was never autofilled
// costs a live Google Places lookup to verify.
//
// Per field is the whole point. Someone clarifying "Giant" to "Giant
// (Wynnewood)" is still pointing at the same business: that protects the name
// and nothing else, while its hours and phone keep tracking Google.
//
// Ownership is recorded as `details.googleFields`, the list of fields Google
// may write. Two properties make it reliable rather than bookkeeping:
//
//   * A human edit releases ownership for free. An edit's UNCHANGED fields
//     keep whatever ownership they already had (no re-check at all); a field
//     the submitter actually changed is freshly decided against real Google
//     data, so correcting it by hand hands ownership back with no extra
//     wiring in the edit path.
//
//   * Rows predating this mechanism were reconciled once by
//     scripts/reconcile-google-provenance.mjs, which infers the same answer by
//     comparing stored values against Google's: an exact match means it's
//     Google's. Anything that differed was left as the submitter's.

/** Fields the sync will only write when it owns them. `businessStatus` and
 *  `googleDescription` are deliberately absent — they're Google-only concepts
 *  with no hand-curated counterpart, so they're always refreshed.
 *
 *  `name` is tracked per-field like the rest, deliberately: a submitter who
 *  clarifies "Giant" to "Giant (Wynnewood)" is still pointing at the same
 *  business, so the edit protects the name and nothing else — hours and phone
 *  keep following Google.
 *
 *  `website` behaves like `phone`/`hours` (submitter-overridable, tracked),
 *  not like `address` (fill-once-when-empty) — a kosher stand's own site can
 *  legitimately differ from the parent business Google links. */
export const OWNABLE_SYNC_FIELDS = ['name', 'hours', 'phone', 'address', 'website'] as const
export type OwnableSyncField = (typeof OWNABLE_SYNC_FIELDS)[number]

/** Nothing there to protect: unset, blank, or an object with no keys. Note that
 *  a fully-populated "closed every day" hours object is NOT empty — someone
 *  chose that, and Google mustn't overwrite it. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

/** Whether the sync may write `field`, given the listing's current value for it
 *  and its `details`. See the note above. */
export function syncMayWrite(
  details: Record<string, unknown> | null | undefined,
  field: OwnableSyncField,
  currentValue: unknown,
): boolean {
  // Address is special regardless of provenance: `geo` is derived from it, so
  // replacing a curated address would silently move the pin. Only ever filled
  // when there's nothing there.
  if (field === 'address') return isEmptyValue(currentValue)

  const owned = details?.googleFields
  // Provenance on record (the submission form captured it, or a previous sync
  // wrote it) — believe it exactly. A field that isn't listed is the
  // submitter's, even when it's blank: someone who deliberately cleared a
  // wrong autofilled phone number shouldn't get it put back.
  if (Array.isArray(owned)) return owned.includes(field)

  // No provenance recorded — a row that predates the form capturing it. Fill
  // gaps only; anything with a value in it was put there by a person.
  return isEmptyValue(currentValue)
}

/** The `googleFields` list to store after a sync wrote `written`. Additive —
 *  a field Google owned before and simply had nothing new for this run stays
 *  owned, so one blank response doesn't silently hand it back. */
export function nextGoogleFields(
  details: Record<string, unknown> | null | undefined,
  written: readonly OwnableSyncField[],
): OwnableSyncField[] {
  const prior = Array.isArray(details?.googleFields) ? (details.googleFields as string[]) : []
  const merged = new Set<string>([...prior, ...written])
  return OWNABLE_SYNC_FIELDS.filter((f) => merged.has(f))
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
  name?: string
  business_status?: string
  formatted_phone_number?: string
  formatted_address?: string
  opening_hours?: GoogleOpeningHours
  editorial_summary?: { overview?: string }
  website?: string
}

/**
 * Fetches current hours/phone/address/website/status for a known place id.
 * Returns null on any failure (network, bad status, place id gone) so the
 * caller can skip the listing and leave its existing data untouched.
 * Server-side only.
 */
export async function fetchPlaceSync(placeId: string): Promise<PlaceSync | null> {
  const key = serverKey()
  if (!key) return null
  try {
    const fields =
      'name,business_status,formatted_phone_number,formatted_address,opening_hours,editorial_summary,website'
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${key}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as { status: string; result?: GooglePlaceResult }
    if (data.status !== 'OK' || !data.result) return null
    const r = data.result
    return {
      name: r.name ?? null,
      hours: googleHoursToStructured(r.opening_hours),
      phone: r.formatted_phone_number ?? null,
      address: r.formatted_address ?? null,
      website: r.website ?? null,
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
