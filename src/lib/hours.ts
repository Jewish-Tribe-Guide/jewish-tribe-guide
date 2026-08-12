// Shared types and helpers for the structured `hours` category field.
//
// Value shape stored in Supabase details JSONB:
//   { sun: { open: "HH:MM", close: "HH:MM" } | null, mon: ..., ... }
// Days absent from the object are treated as closed.

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
export type DayHours = { open: string; close: string } | null
export type StructuredHours = Partial<Record<DayKey, DayHours>>

export const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DAY_LABELS: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

const DAY_SHORT: Record<DayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

/** Returns true when `v` is a structured-hours object (not a legacy string). */
export function isStructuredHours(v: unknown): v is StructuredHours {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Formats "HH:MM" (24-h) to "h:mm AM/PM". */
export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

/**
 * Returns true (open), false (closed), or null (can't tell).
 *
 * Returns null when `v` is not structured hours (legacy text value or missing).
 * Returns false when today's hours are null (explicitly closed) or absent.
 */
export function hoursOpenNow(v: unknown): boolean | null {
  if (!isStructuredHours(v)) return null
  const hours = v as Record<string, DayHours>
  const today = new Date()
  const dayKey = DAY_KEYS[today.getDay()]
  const day = hours[dayKey]
  if (day === null || day === undefined) return false
  if (!day.open || !day.close) return null
  const nowMins = today.getHours() * 60 + today.getMinutes()
  const [oh, om] = day.open.split(':').map(Number)
  const [ch, cm] = day.close.split(':').map(Number)
  return nowMins >= oh * 60 + om && nowMins <= ch * 60 + cm
}

/**
 * For a place that's open right now, describes how close it is to closing.
 *   { closesSoon, closeLabel }
 *     - closesSoon: true when today's close time is within `withinMins` of now
 *     - closeLabel: today's formatted close time, e.g. "6:00 PM"
 * Returns null when the value isn't structured hours, or the place isn't open
 * right now (so callers can keep using `hoursOpenNow` to decide open vs. closed).
 *
 * A 23:59 close is our "open through end of day" sentinel (24/7 or a period
 * that rolls past midnight), so it never counts as closing soon.
 */
export function hoursClosing(
  v: unknown,
  withinMins = 60,
): { closesSoon: boolean; closeLabel: string } | null {
  if (!isStructuredHours(v)) return null
  const hours = v as Record<string, DayHours>
  const now = new Date()
  const day = hours[DAY_KEYS[now.getDay()]]
  if (!day || !day.open || !day.close) return null
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = day.open.split(':').map(Number)
  const [ch, cm] = day.close.split(':').map(Number)
  const closeMins = ch * 60 + cm
  if (nowMins < oh * 60 + om || nowMins > closeMins) return null // not open now
  return {
    closesSoon: day.close !== '23:59' && closeMins - nowMins <= withinMins,
    closeLabel: fmt12(day.close),
  }
}

/**
 * A listing's "Open"/"Closes Soon" status, from whichever of its hours
 * fields (there can be more than one — e.g. Mikvah's separate men's/women's/
 * keilim hours) says it's open right now. Shared by the collapsed listing
 * card's Open badge and the full detail body's status row, so the two can
 * never disagree about whether a place is open.
 */
export function getOpenStatus(
  item: Record<string, unknown>,
  hoursFieldKeys: string[],
): { isOpen: boolean; closing: { closesSoon: boolean; closeLabel: string } | null } {
  const openVal = hoursFieldKeys
    .map((k) => item[k])
    .find((v) => v !== undefined && hoursOpenNow(v) === true && isStructuredHours(v))
  const isOpen = openVal !== undefined
  return { isOpen, closing: isOpen ? hoursClosing(openVal) : null }
}

/** "2026-06-07T…" → "Synced from Google · updated 3d ago" / "… updated today".
 *  Returns null if unparseable or absent. A listing-level fact (from its
 *  Google placeId), not tied to any one hours field — see PlaceDetailBody's
 *  own use of this for why it isn't gated on the category having hours at all. */
export function syncedLabel(iso?: string): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Synced from Google · updated today'
  if (days === 1) return 'Synced from Google · updated 1d ago'
  return `Synced from Google · updated ${days}d ago`
}

/**
 * One-line label for today's hours shown on a directory card.
 *  - Structured hours → "Today: 9:00 AM – 5:00 PM" or "Closed today"
 *  - Legacy text string → the raw string (unchanged)
 *  - Missing/empty → null
 */
export function formatTodayHours(v: unknown): string | null {
  if (!v && v !== false) return null
  if (typeof v === 'string') return v || null
  if (!isStructuredHours(v)) return null
  const hours = v as Record<string, DayHours>
  const dayKey = DAY_KEYS[new Date().getDay()]
  const day = hours[dayKey]
  if (day === null || day === undefined) return 'Closed today'
  if (!day.open || !day.close) return null
  return `Today: ${fmt12(day.open)} – ${fmt12(day.close)}`
}

/**
 * Full 7-day breakdown for the expandable hours view on a directory card.
 *  - Structured hours → one entry per day (Sun→Sat), with today flagged.
 *  - Legacy text string or missing → null (caller falls back to the raw text).
 */
export function formatWeekHours(
  v: unknown,
): Array<{ key: DayKey; label: string; text: string; isToday: boolean }> | null {
  if (!isStructuredHours(v)) return null
  const hours = v as Record<string, DayHours>
  const todayKey = DAY_KEYS[new Date().getDay()]
  return DAY_KEYS.map((key) => {
    const day = hours[key] ?? null
    const text = day ? `${fmt12(day.open)} – ${fmt12(day.close)}` : 'Closed'
    return { key, label: DAY_LABELS[key], text, isToday: key === todayKey }
  })
}

/**
 * Multi-day summary for admin / diff display.
 * e.g. "Sun 9:00 AM–2:00 PM · Mon Closed · Tue–Sat 9:00 AM–5:00 PM"
 *
 * Collapses consecutive days with identical hours into ranges.
 * For a legacy text string, returns the raw string.
 * For an empty/missing value, returns "—".
 */
export function formatHoursSummary(v: unknown): string {
  if (!v) return '—'
  if (typeof v === 'string') return v
  if (!isStructuredHours(v)) return '—'
  const hours = v as Record<string, DayHours>

  // Build segments: consecutive days with identical open/close collapse to one range.
  type Seg = { keys: DayKey[]; day: DayHours }
  const segments: Seg[] = []
  for (const key of DAY_KEYS) {
    const day = hours[key] ?? null
    const last = segments[segments.length - 1]
    const sameAsLast =
      last &&
      ((day === null && last.day === null) ||
        (day !== null && last.day !== null && day.open === last.day.open && day.close === last.day.close))
    if (sameAsLast) {
      last.keys.push(key)
    } else {
      segments.push({ keys: [key], day })
    }
  }

  return segments
    .map(({ keys, day }) => {
      const range =
        keys.length === 1
          ? DAY_SHORT[keys[0]]
          : `${DAY_SHORT[keys[0]]}–${DAY_SHORT[keys[keys.length - 1]]}`
      const times = day ? `${fmt12(day.open)}–${fmt12(day.close)}` : 'Closed'
      return `${range} ${times}`
    })
    .join(' · ')
}

/** Full label for a day key, e.g. "Monday". */
export function dayLabel(key: DayKey): string {
  return DAY_LABELS[key]
}

// ── New Places JS API hours mapper (client-safe) ─────────────────────────────
// The PlaceAutocompleteElement uses the new Places JS API, which represents
// opening hours as { day, hour, minute } numbers rather than "HHMM" strings.
// This mapper is the client-side counterpart to googleHoursToStructured in
// googlePlaces.ts (which handles the legacy REST API format used by scripts).

type PlacesApiPoint = { day: number; hour: number; minute: number }
type PlacesApiPeriod = { open: PlacesApiPoint; close?: PlacesApiPoint | null }

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Maps a Google Places JS API `regularOpeningHours.periods` array into
 * StructuredHours. Pass `place.regularOpeningHours.periods` directly.
 * Returns null when periods is empty/null so callers leave existing hours
 * untouched rather than blanking them.
 */
export function placesApiHoursToStructured(periods: PlacesApiPeriod[]): StructuredHours | null {
  if (!periods || periods.length === 0) return null

  // 24/7: single open-only period at midnight on day 0.
  if (periods.length === 1 && !periods[0].close && periods[0].open.hour === 0 && periods[0].open.minute === 0) {
    const allDay: StructuredHours = {}
    for (const key of DAY_KEYS) allDay[key] = { open: '00:00', close: '23:59' }
    return allDay
  }

  const result: StructuredHours = {}
  for (const key of DAY_KEYS) result[key] = null

  for (const p of periods) {
    const dayIdx = p.open.day
    if (dayIdx < 0 || dayIdx > 6) continue
    const key: DayKey = DAY_KEYS[dayIdx]
    const open = padTime(p.open.hour, p.open.minute)
    const close =
      !p.close || p.close.day !== dayIdx
        ? '23:59'
        : padTime(p.close.hour, p.close.minute)

    const existing = result[key]
    if (!existing) {
      result[key] = { open, close }
    } else {
      result[key] = {
        open: open < existing.open ? open : existing.open,
        close: close > existing.close ? close : existing.close,
      }
    }
  }

  return result
}
