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
