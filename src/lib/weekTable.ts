import { formatDays, TEFILLAH_LABELS, TEFILLAH_ORDER, ZMAN_ANCHOR_LABELS, type Minyan, type MinyanDayKey, type Tefillah } from './davening'
import { isOutOfSeason, type Season } from './season'
import type { DayKey } from './hours'

// ── A shul's usual times, as two boxes (agreed Oct 6) ───────────────────────
// "Davening times" read as two lists that didn't match (Today and tomorrow,
// The whole week) and day lists that overlapped ("Mon, Thu 6:45 / Mon–Fri
// 8:00 / Tue, Wed, Fri 7:00": what's on Thursday?). Now:
//
//   Usual weekday times: one small table, a column a tefillah, days with the
//   same times on one row ("Mon, Thu"), so nobody works out an overlap.
//   Usual Shabbos times: in the order Shabbos happens, Friday night,
//   Shabbos morning, afternoon, Motzei Shabbos.
//
// Both are the shul's usual times, so a time set by a zman is written as the
// rule ("15 min before sunset"), never as one week's clock time; the card
// adds this week's in grey where it knows it. Only this season's times; the
// other season is one short line. Friday's Shacharis is a weekday's; Friday
// afternoon and night are Shabbos's.

const WEEKDAYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri']

/** "7:15am", "19:30", "7 AM" as minutes from midnight; null for words
 *  ("Call to confirm") or nothing. */
export function clockMinutes(time: string): number | null {
  const t = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i)
  if (!t) return null
  let h = Number(t[1])
  const m = t[2] ? Number(t[2]) : 0
  const half = t[3]?.toLowerCase().replace(/\./g, '')
  if (h > 23 || m > 59 || (!half && !t[2])) return null
  if (half === 'pm' && h !== 12) h += 12
  if (half === 'am' && h === 12) h = 0
  return h * 60 + m
}

/** "7:15 AM", "6 PM": every time on the guide written one way. */
export function clockText(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** A minyan's time as its shul gives it: "9:15 AM"; "at candle lighting,
 *  never after 7 PM"; "15 min before sunset"; or its own words. */
export function timeText(row: Pick<Minyan, 'time' | 'anchor' | 'offsetMinutes' | 'notBefore' | 'notAfter'>): string {
  if (row.anchor) {
    const zman = ZMAN_ANCHOR_LABELS[row.anchor].toLowerCase()
    const off = row.offsetMinutes ?? 0
    const base = off === 0 ? `at ${zman}` : `${Math.abs(off)} min ${off < 0 ? 'before' : 'after'} ${zman}`
    const bound = (t?: string) => {
      const mins = t ? clockMinutes(t) : null
      return mins === null ? (t?.trim() ?? null) : clockText(mins)
    }
    const after = bound(row.notAfter)
    const before = bound(row.notBefore)
    if (before && after) return `${base}, between ${before} and ${after}`
    if (after) return `${base}, never after ${after}`
    if (before) return `${base}, never before ${before}`
    return base
  }
  const mins = clockMinutes(row.time)
  if (mins !== null) return clockText(mins)
  const words = row.time.trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** A shul's note, tidied: "Ends at 12:15pm" reads "Until 12:15 PM". */
export function noteText(note: string | undefined): string | null {
  const n = note?.trim()
  if (!n) return null
  const ends = n.match(/^ends?\s+(?:at|by)\s+(.+?)\.?$/i)
  if (ends) {
    const mins = clockMinutes(ends[1])
    return `Until ${mins === null ? ends[1] : clockText(mins)}`
  }
  return n.charAt(0).toUpperCase() + n.slice(1)
}

/** Several clock times in one cell: "7, 8 AM"; "7:30 AM, 1 PM". */
function joinTimes(times: number[]): string {
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  const am = sorted.every((t) => t < 720)
  const pm = sorted.every((t) => t >= 720)
  if (sorted.length > 1 && (am || pm)) return `${sorted.map((t) => clockText(t).replace(/ [AP]M$/, '')).join(', ')} ${am ? 'AM' : 'PM'}`
  return sorted.map(clockText).join(', ')
}

const inSeason = (m: Minyan, season: Season | null) => !isOutOfSeason(m.season, season)
const otherSeason = (season: Season | null): Season | null => (season === 'summer' ? 'winter' : season === 'winter' ? 'summer' : null)

export type WeekRow = {
  days: DayKey[]
  /** "Sun", "Mon, Thu", "Sun–Thu". */
  label: string
  /** One per column, "—" where there's none. */
  cells: string[]
}

export type WeekdayTable = {
  columns: Tefillah[]
  rows: WeekRow[]
  /** The rules the cells use, for the card to give today's clock time:
   *  "15 min before sunset" with the row it came from. */
  rules: { text: string; row: Minyan }[]
  /** Notes under the table: a minyan's own ("Sun Shacharis: followed by
   *  bagels, lox and Torah") and when it's also held ("Shacharis 6:45 AM
   *  also on Rosh Chodesh"). */
  notes: string[]
  /** "In winter, Maariv 6:30 PM, Sun–Thu.": the other season's, briefly. */
  otherSeason: string | null
}

/** Friday's Shacharis is a weekday's; Friday's afternoon and night are
 *  Shabbos's. */
const onWeekday = (m: Minyan, day: DayKey) => m.days.includes(day) && (day !== 'fri' || m.tefillah === 'shacharis')

/** The weekday table, or null when the shul has no weekday minyan. */
export function weekdayTable(minyanim: readonly Minyan[], season: Season | null): WeekdayTable | null {
  const now = minyanim.filter((m) => inSeason(m, season) && WEEKDAYS.some((d) => onWeekday(m, d)))
  if (now.length === 0) return null
  const columns = TEFILLAH_ORDER.filter((t) => now.some((m) => m.tefillah === t))

  const cell = (day: DayKey, t: Tefillah) => {
    const rows = now.filter((m) => m.tefillah === t && onWeekday(m, day))
    if (rows.length === 0) return '—'
    const fixed: number[] = []
    const words: string[] = []
    for (const m of rows) {
      const clock = m.anchor ? null : clockMinutes(m.time)
      if (clock === null) words.push(timeText(m))
      else fixed.push(clock)
    }
    return [fixed.length ? joinTimes(fixed) : null, ...new Set(words)].filter(Boolean).join(', ')
  }

  const rows: WeekRow[] = []
  for (const day of WEEKDAYS) {
    const cells = columns.map((t) => cell(day, t))
    if (cells.every((c) => c === '—')) continue
    const same = rows.find((r) => r.cells.join('|') === cells.join('|'))
    if (same) same.days.push(day)
    else rows.push({ days: [day], label: '', cells })
  }
  for (const r of rows) r.label = formatDays(r.days as MinyanDayKey[])

  const rules = [...new Map(now.filter((m) => m.anchor).map((m) => [timeText(m), m])).entries()].map(([text, row]) => ({ text, row }))

  const notes: string[] = []
  for (const m of now) {
    const days = m.days.filter((d) => WEEKDAYS.includes(d as DayKey) && onWeekday(m, d as DayKey)) as MinyanDayKey[]
    const note = noteText(m.notes)
    if (note) notes.push(`${formatDays(days)} ${TEFILLAH_LABELS[m.tefillah]}: ${note.charAt(0).toLowerCase()}${note.slice(1)}.`.replace(/\.\.$/, '.'))
    const extra = m.days.filter((d) => d === 'rosh_chodesh' || d === 'holiday')
    if (extra.length) notes.push(`${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)} also on ${extra.map((d) => (d === 'holiday' ? 'public holidays' : 'Rosh Chodesh')).join(' and ')}.`)
  }

  const other = otherSeason(season)
  const offSeason = other ? minyanim.filter((m) => m.season === other && WEEKDAYS.some((d) => onWeekday(m, d))) : []
  const otherLine = offSeason.length
    ? `In ${other}, ${offSeason.map((m) => `${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)}, ${formatDays(m.days.filter((d) => WEEKDAYS.includes(d as DayKey) && onWeekday(m, d as DayKey)) as MinyanDayKey[])}`).join('; ')}.`
    : null

  return { columns, rows, rules, notes, otherSeason: otherLine }
}

export type ShabbosPart = 'friday' | 'morning' | 'afternoon' | 'motzei'

export const SHABBOS_PART_LABELS: Record<ShabbosPart, string> = {
  friday: 'Friday night',
  morning: 'Shabbos morning',
  afternoon: 'Afternoon',
  motzei: 'Motzei Shabbos',
}

export type ShabbosLine = {
  part: ShabbosPart
  tefillah: Tefillah
  /** "9:15 AM", "at candle lighting, never after 7 PM". */
  when: string
  note: string | null
  /** For the card's "this Friday 6:12 PM". */
  row: Minyan
}

function partOf(m: Minyan, day: 'fri' | 'sat'): ShabbosPart {
  if (day === 'fri') return 'friday'
  if (m.tefillah === 'shacharis' || m.tefillah === 'shabbos_mussaf') return 'morning'
  if (m.tefillah === 'maariv' || m.anchor === 'havdalah') return 'motzei'
  return 'afternoon'
}

const PART_ORDER: ShabbosPart[] = ['friday', 'morning', 'afternoon', 'motzei']

/** A shul's usual Shabbos, in the order it happens; null when it has none
 *  listed. `otherSeason`: "In winter, also Mincha 12:20 PM, after Kiddush." */
export function shabbosList(minyanim: readonly Minyan[], season: Season | null): { lines: ShabbosLine[]; otherSeason: string | null } | null {
  const lineOf = (m: Minyan, day: 'fri' | 'sat'): ShabbosLine => ({ part: partOf(m, day), tefillah: m.tefillah, when: timeText(m), note: noteText(m.notes), row: m })
  const of = (keep: (m: Minyan) => boolean) =>
    minyanim.filter(keep).flatMap((m) => [
      ...(m.days.includes('fri') && m.tefillah !== 'shacharis' ? [lineOf(m, 'fri')] : []),
      ...(m.days.includes('sat') ? [lineOf(m, 'sat')] : []),
    ])
  const order = (a: ShabbosLine, b: ShabbosLine) =>
    PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) ||
    (clockMinutes(a.row.time) ?? 24 * 60) - (clockMinutes(b.row.time) ?? 24 * 60) ||
    TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah)
  const lines = of((m) => inSeason(m, season)).sort(order)
  const other = otherSeason(season)
  const offSeason = other ? of((m) => m.season === other).sort(order) : []
  if (lines.length === 0 && offSeason.length === 0) return null
  const otherLine = offSeason.length
    ? `In ${other}, also ${offSeason.map((l) => `${TEFILLAH_LABELS[l.tefillah]} ${l.when}${l.note ? `, ${l.note.charAt(0).toLowerCase()}${l.note.slice(1)}` : ''}`).join('; ')}.`
    : null
  return { lines, otherSeason: otherLine }
}
