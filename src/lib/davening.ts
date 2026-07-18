// Shared types and helpers for structured minyanim data.
//
// Each synagogue stores `details.minyanim`: a Minyan[] array.
// DaveningTimesModal and the shared DaveningTimes card component use the
// grouping helpers here to render tefillah-grouped or day-grouped views.
//
// Day key types are re-used from hours.ts to avoid duplication.

import type { DayKey } from './hours'
import { DAY_KEYS } from './hours'

export type { DayKey }
// Alias so callers can import ALL_DAYS from here instead of hours.
export { DAY_KEYS as ALL_DAYS }

export type Tefillah =
  | 'shacharis'
  | 'kabbalas_shabbos'
  | 'shabbos_mussaf'
  | 'mincha'
  | 'maariv'
  | 'other'

/** Canonical tefillah display order. */
export const TEFILLAH_ORDER: Tefillah[] = [
  'shacharis',
  'kabbalas_shabbos',
  'shabbos_mussaf',
  'mincha',
  'maariv',
  'other',
]

export const TEFILLAH_LABELS: Record<Tefillah, string> = {
  shacharis: 'Shacharis',
  kabbalas_shabbos: 'Kabbalas Shabbos',
  shabbos_mussaf: 'Shabbos Mussaf',
  mincha: 'Mincha',
  maariv: 'Maariv',
  other: 'Other',
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

const DAY_FULL: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

export type Minyan = {
  id: string
  tefillah: Tefillah
  /** Days this minyan occurs. Empty means unspecified. */
  days: DayKey[]
  /** Free text: "7:00am", "7:30 AM", "19:30", "20 min before sunset". */
  time: string
  notes?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse "7:30am" / "7:30 AM" / "19:30" to minutes-since-midnight for sorting.
 * Returns Infinity for relative times ("At sunset", "15 min before sunset").
 */
export function parseTimeToMinutes(time: string): number {
  const t = time.trim()
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return parseInt(hhmm[1]) * 60 + parseInt(hhmm[2])
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = parseInt(ampm[2])
    if (ampm[3].toLowerCase() === 'pm' && h !== 12) h += 12
    if (ampm[3].toLowerCase() === 'am' && h === 12) h = 0
    return h * 60 + m
  }
  return Infinity
}

/** Returns true when `v` is a valid Minyan[]. */
export function isMinyanim(v: unknown): v is Minyan[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        e != null &&
        typeof e === 'object' &&
        'tefillah' in e &&
        'days' in e &&
        'time' in e,
    )
  )
}

/**
 * Human-readable day range label.
 *  - All 7 days → "Daily"
 *  - Consecutive block of ≥ 3 → "Mon–Fri"
 *  - Otherwise → "Mon, Wed, Fri"
 *  - Empty → ""
 */
export function formatDays(days: DayKey[]): string {
  if (!days.length) return ''
  if (days.length === DAY_KEYS.length) return 'Daily'
  const indices = days.map((d) => DAY_KEYS.indexOf(d)).sort((a, b) => a - b)
  const consecutive = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1)
  if (consecutive && days.length >= 3) {
    return `${DAY_SHORT[DAY_KEYS[indices[0]]]}–${DAY_SHORT[DAY_KEYS[indices[indices.length - 1]]]}`
  }
  return indices.map((i) => DAY_SHORT[DAY_KEYS[i]]).join(', ')
}

// ── Group types ────────────────────────────────────────────────────────────────

export type ShulInfo = {
  name: string
  denomination?: string
  driveMinutes?: number | null
  walkMinutes?: number | null
  minyanim: Minyan[]
}

export type ByTefillahGroup = {
  tefillah: Tefillah
  label: string
  rows: Array<{
    shul: string
    days: DayKey[]
    daysLabel: string
    time: string
    notes?: string
    denomination?: string
    driveMinutes?: number | null
    walkMinutes?: number | null
  }>
}

export type ByDayGroup = {
  day: DayKey
  label: string
  rows: Array<{
    shul: string
    tefillah: Tefillah
    tefillahLabel: string
    time: string
    notes?: string
    denomination?: string
    driveMinutes?: number | null
    walkMinutes?: number | null
  }>
}

// ── Grouping helpers ───────────────────────────────────────────────────────────

export function groupByTefillah(shuls: ShulInfo[]): ByTefillahGroup[] {
  const map = new Map<Tefillah, ByTefillahGroup['rows']>()
  for (const t of TEFILLAH_ORDER) map.set(t, [])

  for (const shul of shuls) {
    for (const m of shul.minyanim) {
      map.get(m.tefillah)?.push({
        shul: shul.name,
        days: m.days,
        daysLabel: formatDays(m.days),
        time: m.time,
        notes: m.notes,
        denomination: shul.denomination,
        driveMinutes: shul.driveMinutes,
        walkMinutes: shul.walkMinutes,
      })
    }
  }

  return TEFILLAH_ORDER.filter((t) => (map.get(t)?.length ?? 0) > 0).map((t) => ({
    tefillah: t,
    label: TEFILLAH_LABELS[t],
    rows: (map.get(t) ?? []).sort((a, b) => {
      const aDay = a.days.length > 0 ? Math.min(...a.days.map((d) => DAY_KEYS.indexOf(d))) : Infinity
      const bDay = b.days.length > 0 ? Math.min(...b.days.map((d) => DAY_KEYS.indexOf(d))) : Infinity
      return aDay - bDay || parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
    }),
  }))
}

export function groupByDay(shuls: ShulInfo[]): ByDayGroup[] {
  const map = new Map<DayKey, ByDayGroup['rows']>()
  for (const d of DAY_KEYS) map.set(d, [])

  for (const shul of shuls) {
    for (const m of shul.minyanim) {
      for (const day of m.days) {
        map.get(day)?.push({
          shul: shul.name,
          tefillah: m.tefillah,
          tefillahLabel: TEFILLAH_LABELS[m.tefillah],
          time: m.time,
          notes: m.notes,
          denomination: shul.denomination,
          driveMinutes: shul.driveMinutes,
          walkMinutes: shul.walkMinutes,
        })
      }
    }
  }

  return DAY_KEYS.filter((d) => (map.get(d)?.length ?? 0) > 0).map((d) => ({
    day: d,
    label: DAY_FULL[d],
    rows: (map.get(d) ?? []).sort(
      (a, b) =>
        TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) ||
        parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
    ),
  }))
}
