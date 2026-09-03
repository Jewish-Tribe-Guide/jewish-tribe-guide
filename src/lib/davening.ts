// Shared types and helpers for structured minyanim data.
//
// Each synagogue stores `details.minyanim`: a Minyan[] array.
// DaveningTimesModal and the shared DaveningTimes card component use the
// grouping helpers here to render tefillah-grouped or day-grouped views.
//
// Day key types are re-used from hours.ts to avoid duplication.

import type { DayKey } from './hours'
import type { Season } from './season'
import { DAY_KEYS, fmt12 } from './hours'

export type { DayKey }
export type { Season }
// Alias so callers can import ALL_DAYS from here instead of hours.
export { DAY_KEYS as ALL_DAYS }

/** A minyan's `days` can be a real weekday, or one of two pseudo-days a shul
 *  posts a separate schedule for: Rosh Chodesh (a Jewish calendar event, not
 *  a weekday) and a secular Holiday (July 4th, Thanksgiving, etc.). Kept
 *  distinct from the plain `DayKey` used for hours-of-operation, which only
 *  ever means a real weekday. */
export type MinyanDayKey = DayKey | 'rosh_chodesh' | 'holiday'

/** Every selectable "day" for a minyan, in display/sort order — real weekdays
 *  first, then the two pseudo-days. */
export const ALL_MINYAN_DAYS: MinyanDayKey[] = [...DAY_KEYS, 'rosh_chodesh', 'holiday']

function isRealDay(d: MinyanDayKey): d is DayKey {
  return (DAY_KEYS as string[]).includes(d)
}

export type Tefillah =
  | 'shacharis'
  | 'kabbalas_shabbos'
  | 'shabbos_mussaf'
  | 'mincha'
  | 'maariv'
  | 'mincha_maariv'
  | 'other'

/** Canonical tefillah display order. */
export const TEFILLAH_ORDER: Tefillah[] = [
  'shacharis',
  'kabbalas_shabbos',
  'shabbos_mussaf',
  'mincha',
  'maariv',
  'mincha_maariv',
  'other',
]

export const TEFILLAH_LABELS: Record<Tefillah, string> = {
  shacharis: 'Shacharis',
  kabbalas_shabbos: 'Kabbalas Shabbos',
  shabbos_mussaf: 'Shabbos Mussaf',
  mincha: 'Mincha',
  maariv: 'Maariv',
  mincha_maariv: 'Mincha & Maariv',
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

const DAY_FULL: Record<MinyanDayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  rosh_chodesh: 'Rosh Chodesh',
  holiday: 'Holiday',
}

/** A zman a minyan can be defined relative to, instead of a fixed clock time. */
export type ZmanAnchor = 'sunset' | 'candle_lighting' | 'havdalah'

export const ZMAN_ANCHOR_LABELS: Record<ZmanAnchor, string> = {
  sunset: 'Sunset',
  candle_lighting: 'Candle Lighting',
  havdalah: 'Havdalah',
}

/** Human-readable rule text for an anchor + signed offset — e.g. "20 min
 *  before Sunset" / "10 min after Havdalah" / "At Sunset". This is what gets
 *  stored in `Minyan.time` for anchor-based rows, so every existing display/
 *  sort call site keeps working unchanged; `anchor`/`offsetMinutes` are only
 *  consulted when a caller wants to additionally show a calculated clock time. */
export function formatAnchorRule(
  anchor: ZmanAnchor,
  offsetMinutes: number,
  bounds: MinyanBounds = {},
): string {
  const label = ZMAN_ANCHOR_LABELS[anchor]
  const base =
    offsetMinutes === 0
      ? `At ${label}`
      : `${Math.abs(offsetMinutes)} min ${offsetMinutes < 0 ? 'before' : 'after'} ${label}`
  return `${base}${formatBounds(bounds)}`
}

/** The earliest/latest clock times a zman-based minyan is held between, as
 *  "HH:MM" (24-hour) — the exact shape an `<input type="time">` produces, so
 *  the intake form stores what it reads with no conversion, and fmt12 /
 *  parseTimeToMinutes both already understand it.
 *
 *  This is what lets a shul say "candle lighting, but never before 5:00pm and
 *  never after 7:00pm" — one rule that holds all year. `season` can't express
 *  that: the rule doesn't change with the season, it's the same rule whose
 *  clamp simply happens to bite at the two ends of the year. Keeping them
 *  separate is deliberate — `season` answers "does this minyan run now",
 *  bounds answer "what time does it start". */
export type MinyanBounds = {
  notBefore?: string
  notAfter?: string
}

/** The parenthetical a bounded rule carries, or "" when unbounded. Folded
 *  into the generated `time` text rather than kept only in the structured
 *  fields, because `time` is what every display, sort and — critically — the
 *  moderation diff reads. A bound edited from 7:00pm to 7:15pm has to READ as
 *  a change in the queue, or an admin approves it blind. */
function formatBounds({ notBefore, notAfter }: MinyanBounds): string {
  if (notBefore && notAfter) return ` (between ${fmt12(notBefore)} and ${fmt12(notAfter)})`
  if (notBefore) return ` (not before ${fmt12(notBefore)})`
  if (notAfter) return ` (not after ${fmt12(notAfter)})`
  return ''
}

/**
 * Clamps an already-formatted clock time ("6:12 PM") into a minyan's bounds,
 * returning the bound itself when the time falls outside. Both bounds are
 * inclusive; either may be omitted.
 *
 * Takes formatted text rather than an instant so it stays pure and
 * timezone-free — the caller has already resolved the zman in the community's
 * timezone, and re-deriving a wall clock here would mean threading a tz into
 * a function whose whole job is comparing two times of day.
 *
 * A time it can't parse is returned untouched. Never substitute a bound for
 * something that might not be a time at all: showing a confidently wrong
 * "5:00 PM" is worse than showing the rule text.
 */
export function clampTimeText(time: string, { notBefore, notAfter }: MinyanBounds): string {
  const mins = parseTimeToMinutes(time)
  if (!isFinite(mins)) return time
  if (notBefore && mins < parseTimeToMinutes(notBefore)) return fmt12(notBefore)
  if (notAfter && mins > parseTimeToMinutes(notAfter)) return fmt12(notAfter)
  return time
}

export type Minyan = {
  id: string
  tefillah: Tefillah
  /** Days this minyan occurs. Empty means unspecified. */
  days: MinyanDayKey[]
  /** Free text: "7:00am", "7:30 AM", "19:30", "20 min before sunset" — for
   *  anchor-based rows this is auto-generated by formatAnchorRule and kept in
   *  sync by the intake form, so it stays the display/sort value everywhere. */
  time: string
  notes?: string
  /** Set together with offsetMinutes when this minyan is defined relative to
   *  a zman rather than a fixed clock time. */
  anchor?: ZmanAnchor
  /** Signed minutes from `anchor`: negative = before, positive = after. */
  offsetMinutes?: number
  /** Earliest/latest clock time this minyan is ever held at, clamping the
   *  resolved zman — see MinyanBounds. Only meaningful alongside `anchor`; a
   *  fixed clock time is already fixed. */
  notBefore?: string
  notAfter?: string
  /** Set when a shul only runs this minyan in one half of the year — the
   *  structured form of the "Winter only" / "Summer only" that used to be
   *  typed into `notes` by hand. Which half it currently is gets derived from
   *  the community's timezone (lib/season.ts), never configured; out-of-season
   *  rows are dimmed and labelled, never hidden. Absent means all year. */
  season?: Season
}

export const SEASON_LABELS: Record<Season, string> = {
  winter: 'Winter only',
  summer: 'Summer only',
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
 *  - All 7 weekdays → "Daily"
 *  - Consecutive block of ≥ 3 weekdays → "Mon–Fri"
 *  - Otherwise → "Mon, Wed, Fri"
 *  - Rosh Chodesh / Holiday aren't part of the weekday rotation — they're
 *    appended by full name instead of folded into a range, e.g. "Mon, Wed,
 *    Rosh Chodesh".
 *  - Empty → ""
 */
export function formatDays(days: MinyanDayKey[]): string {
  if (!days.length) return ''
  const real = days.filter(isRealDay)
  const pseudo = days.filter((d) => !isRealDay(d))
  const parts: string[] = []
  if (real.length === DAY_KEYS.length) {
    parts.push('Daily')
  } else if (real.length) {
    const indices = real.map((d) => DAY_KEYS.indexOf(d)).sort((a, b) => a - b)
    const consecutive = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1)
    parts.push(
      consecutive && real.length >= 3
        ? `${DAY_SHORT[DAY_KEYS[indices[0]]]}–${DAY_SHORT[DAY_KEYS[indices[indices.length - 1]]]}`
        : indices.map((i) => DAY_SHORT[DAY_KEYS[i]]).join(', '),
    )
  }
  for (const p of pseudo) parts.push(DAY_FULL[p])
  return parts.join(', ')
}

// ── Group types ────────────────────────────────────────────────────────────────

export type ShulInfo = {
  name: string
  denomination?: string
  driveMinutes?: number | null
  walkMinutes?: number | null
  /** Coordinates, when known — lets callers look up a calculated clock time
   *  for this shul's anchor-based rows (see useZmanAnchors). */
  geo?: { lat: number; lng: number } | null
  minyanim: Minyan[]
}

export type ByTefillahGroup = {
  tefillah: Tefillah
  label: string
  rows: Array<{
    shul: string
    days: MinyanDayKey[]
    daysLabel: string
    time: string
    notes?: string
    denomination?: string
    driveMinutes?: number | null
    walkMinutes?: number | null
    anchor?: ZmanAnchor
    offsetMinutes?: number
    notBefore?: string
    notAfter?: string
    season?: Season
  }>
}

export type ByDayGroup = {
  day: MinyanDayKey
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
    anchor?: ZmanAnchor
    offsetMinutes?: number
    notBefore?: string
    notAfter?: string
    season?: Season
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
        anchor: m.anchor,
        offsetMinutes: m.offsetMinutes,
        notBefore: m.notBefore,
        notAfter: m.notAfter,
        season: m.season,
      })
    }
  }

  return TEFILLAH_ORDER.filter((t) => (map.get(t)?.length ?? 0) > 0).map((t) => ({
    tefillah: t,
    label: TEFILLAH_LABELS[t],
    rows: (map.get(t) ?? []).sort((a, b) => {
      const aDay = a.days.length > 0 ? Math.min(...a.days.map((d) => ALL_MINYAN_DAYS.indexOf(d))) : Infinity
      const bDay = b.days.length > 0 ? Math.min(...b.days.map((d) => ALL_MINYAN_DAYS.indexOf(d))) : Infinity
      return aDay - bDay || parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
    }),
  }))
}

/**
 * Merges adjacent rows (from a ByTefillahGroup, already sorted by day then
 * time) that share the same days and notes into one, joining their times with
 * a comma — e.g. two separate Shacharis minyanim on Sunday (7:30am and
 * 8:30am, entered as two Minyan entries) read as "Sun  7:30am, 8:30am" on the
 * compact listing card instead of two stacked lines. The "All davening
 * times" modal intentionally does NOT use this — every minyan should still
 * count as its own row there.
 */
export function mergeSameDayTimes(rows: ByTefillahGroup['rows']): ByTefillahGroup['rows'] {
  const merged: ByTefillahGroup['rows'] = []
  for (const row of rows) {
    const prev = merged[merged.length - 1]
    // Season is part of the identity, not a detail: a shul that runs 6:30pm in
    // winter and sunset-anchored in summer has two minyanim for the same days,
    // and merging them into "6:30pm, 15 min before Sunset" would lose the only
    // thing that says when each applies.
    if (prev && prev.daysLabel === row.daysLabel && prev.notes === row.notes && prev.season === row.season) {
      // Joining two rows' `time` into one string means neither row's anchor
      // maps to it anymore — drop anchor/offsetMinutes so callers don't try
      // to show a calculated time for a merged multi-time string.
      merged[merged.length - 1] = {
        ...prev,
        time: `${prev.time}, ${row.time}`,
        anchor: undefined,
        offsetMinutes: undefined,
        // Bounds clamp a single resolved time; a joined multi-time string
        // isn't one, so they'd have a caller clamp something meaningless.
        notBefore: undefined,
        notAfter: undefined,
      }
    } else {
      merged.push(row)
    }
  }
  return merged
}

export function groupByDay(shuls: ShulInfo[]): ByDayGroup[] {
  const map = new Map<MinyanDayKey, ByDayGroup['rows']>()
  for (const d of ALL_MINYAN_DAYS) map.set(d, [])

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
          anchor: m.anchor,
          offsetMinutes: m.offsetMinutes,
          notBefore: m.notBefore,
          notAfter: m.notAfter,
          season: m.season,
        })
      }
    }
  }

  return ALL_MINYAN_DAYS.filter((d) => (map.get(d)?.length ?? 0) > 0).map((d) => ({
    day: d,
    label: DAY_FULL[d],
    rows: (map.get(d) ?? []).sort(
      (a, b) =>
        TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) ||
        parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
    ),
  }))
}

/**
 * Every minyan, one per line, in the app's own display order:
 *
 *   Shacharis · Mon, Thu, Rosh Chodesh · 6:45am
 *   Mincha · Sat · 12:20pm · Winter only · following Kiddush
 *
 * For the moderation queue, where the whole point is seeing exactly what an
 * edit proposes. The summary it replaced was "5 minyanim: Shacharis, Mincha"
 * — a count and the distinct tefillos — so changing a time, a day, a note or
 * the season produced a byte-identical string and the diff reported the field
 * as unchanged. A moderator approving a davening-times edit could not see
 * what they were approving.
 *
 * Sorted rather than left in array order, so merely reordering the rows isn't
 * reported as a change. Sorting can only remove that noise; it can't hide a
 * real difference in content, which is the direction that matters here.
 *
 * `anchor`/`offsetMinutes` aren't printed: `time` is generated from them by
 * formatAnchorRule and kept in sync by the intake form, so it already reads
 * "15 min before Sunset". `id` is bookkeeping. Both are asserted as
 * deliberate exclusions in davening.test.ts, which fails if a new field is
 * added to Minyan without deciding whether a moderator should see it.
 */
export function formatMinyanimSummary(minyanim: Minyan[]): string {
  if (minyanim.length === 0) return '—'
  return [...minyanim]
    .sort(
      (a, b) =>
        TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) ||
        parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time) ||
        formatDays(a.days).localeCompare(formatDays(b.days)),
    )
    .map((m) =>
      [
        TEFILLAH_LABELS[m.tefillah],
        formatDays(m.days) || 'Daily',
        m.time,
        m.season && SEASON_LABELS[m.season],
        m.notes,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n')
}
