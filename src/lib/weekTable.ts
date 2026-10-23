import { formatDays, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan, type MinyanDayKey, type Tefillah } from './davening'
import type { Season } from './season'
import { outOfSeason, seasonPartner } from './seasonPairs'
import type { AnchorTimes } from './useZmanAnchors'
import type { DayKey } from './hours'
import { clockMinutes, clockText, noteText, partOf, PART_ORDER, timeText, type ShabbosPart } from './minyanText'

// Lifted into minyanText.ts so the shul's box editor can use them without
// importing this file (see there); still exported from here as before.
export { clockMinutes, clockText, noteText, PART_ORDER, SHABBOS_PART_LABELS, shabbosPartOf, timeText, type ShabbosPart } from './minyanText'

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

/** Several clock times in one cell: "7, 8 AM"; "7:30 AM, 1 PM". */
function joinTimes(times: number[]): string {
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  const am = sorted.every((t) => t < 720)
  const pm = sorted.every((t) => t >= 720)
  if (sorted.length > 1 && (am || pm)) return `${sorted.map((t) => clockText(t).replace(/ [AP]M$/, '')).join(', ')} ${am ? 'AM' : 'PM'}`
  return sorted.map(clockText).join(', ')
}

/** "instead of 5 min before candle lighting": the time a one-season minyan
 *  takes the place of (seasonPartner), its tefillah named only where it
 *  differs ("instead of Maariv 6:30 PM"). Not "also": the user, Oct 23. */
function insteadOf(m: Minyan, pair: Minyan): string {
  return `instead of ${pair.tefillah === m.tefillah ? '' : `${TEFILLAH_LABELS[pair.tefillah]} `}${timeText(pair)}`
}

/** "In winter, …": the other season's rows (outOfSeason, a summer/winter
 *  pair going by its zman), a sentence per season. */
function otherSeasonLine<T>(rows: readonly T[], seasonOf: (r: T) => Season | undefined, say: (rs: T[]) => string): string | null {
  const lines = (['winter', 'summer'] as const).map((s) => rows.filter((r) => seasonOf(r) === s)).flatMap((rs) => (rs.length ? [`In ${seasonOf(rs[0])}, ${say(rs)}.`] : []))
  return lines.length ? lines.join(' ') : null
}

export type WeekRow = {
  days: DayKey[]
  /** "Sun", "Mon, Thu", "Sun–Thu". */
  label: string
  /** One per column, "—" where there's none. */
  cells: string[]
  /** The same cells in parts, so a sign-up minyan's time (davening.ts) can
   *  be marked on its own: "8 PM" and, marked, "9:45 PM". */
  parts: WeekCellPart[][]
}

export type WeekCellPart = { text: string; signUp?: boolean }

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
  /** "In winter, Sun–Thu: Maariv 6:30 PM instead of Mincha & Maariv 15 min
   *  before sunset.": the other season's, briefly. */
  otherSeason: string | null
  /** The table's minyanim that only run when enough sign up, for the box
   *  under it that says where. */
  signUps: Minyan[]
  /** Every one of them does: the box says so for the whole table, and no
   *  time needs marking. */
  everySignUp: boolean
  /** The table's minyanim people can join from home, for the links under
   *  it: a cell holds times, not links. */
  joins: Minyan[]
}

/** Friday's Shacharis is a weekday's; Friday's afternoon and night are
 *  Shabbos's. */
const onWeekday = (m: Minyan, day: DayKey) => m.days.includes(day) && (day !== 'fri' || m.tefillah === 'shacharis')

/** The weekday table, or null when the shul has no weekday minyan. */
export function weekdayTable(minyanim: readonly Minyan[], season: Season | null, anchors?: AnchorTimes): WeekdayTable | null {
  const out = (m: Minyan) => outOfSeason(m, minyanim, season, anchors)
  const now = minyanim.filter((m) => !out(m) && WEEKDAYS.some((d) => onWeekday(m, d)))
  if (now.length === 0) return null
  const columns = TEFILLAH_ORDER.filter((t) => now.some((m) => m.tefillah === t))

  /** A cell's times, regular ones first and then sign-up ones, each
   *  kind's clock times run together ("7, 8 AM") as before. */
  const cell = (day: DayKey, t: Tefillah): WeekCellPart[] => {
    const rows = now.filter((m) => m.tefillah === t && onWeekday(m, day))
    if (rows.length === 0) return [{ text: '—' }]
    const parts: WeekCellPart[] = []
    for (const signUp of [false, true]) {
      const fixed: number[] = []
      const words: string[] = []
      for (const m of rows.filter((r) => !!r.signUp === signUp)) {
        const clock = m.anchor ? null : clockMinutes(m.time)
        if (clock === null) words.push(timeText(m))
        else fixed.push(clock)
      }
      for (const text of [fixed.length ? joinTimes(fixed) : null, ...new Set(words)]) if (text) parts.push(signUp ? { text, signUp } : { text })
    }
    return parts
  }

  const rows: WeekRow[] = []
  for (const day of WEEKDAYS) {
    const parts = columns.map((t) => cell(day, t))
    const cells = parts.map((p) => p.map((x) => x.text).join(', '))
    if (cells.every((c) => c === '—')) continue
    const key = JSON.stringify(parts)
    const same = rows.find((r) => JSON.stringify(r.parts) === key)
    if (same) same.days.push(day)
    else rows.push({ days: [day], label: '', cells, parts })
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

  const offSeason = minyanim.filter((m) => out(m) && WEEKDAYS.some((d) => onWeekday(m, d)))
  const weekdays = (m: Minyan) => formatDays(m.days.filter((d) => WEEKDAYS.includes(d as DayKey) && onWeekday(m, d as DayKey)) as MinyanDayKey[])
  const otherLine = otherSeasonLine(
    offSeason,
    (m) => m.season,
    (ms) =>
      ms
        .map((m) => {
          const pair = seasonPartner(m, minyanim)
          return pair ? `${weekdays(m)}: ${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)} ${insteadOf(m, pair)}` : `${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)}, ${weekdays(m)}`
        })
        .join('; '),
  )

  return { columns, rows, rules, notes, otherSeason: otherLine, signUps: now.filter((m) => m.signUp), everySignUp: now.every((m) => m.signUp), joins: now.filter((m) => m.joinLink?.trim()) }
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

/** A shul's usual Shabbos, in the order it happens; null when it has none
 *  listed. `otherSeason`: "In winter, also Mincha 12:20 PM, after Kiddush.",
 *  or for a pair, "In summer, Friday: Mincha 7 PM instead of 5 min before
 *  candle lighting." */
export function shabbosList(minyanim: readonly Minyan[], season: Season | null, anchors?: AnchorTimes): { lines: ShabbosLine[]; otherSeason: string | null } | null {
  const out = (m: Minyan) => outOfSeason(m, minyanim, season, anchors)
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
  const lines = of((m) => !out(m)).sort(order)
  const offSeason = of(out).sort(order)
  if (lines.length === 0 && offSeason.length === 0) return null
  // One that takes another's place says which, and on which day ("Friday:
  // Mincha 7 PM instead of 5 min before candle lighting"); one held as well
  // is "also".
  const said = (l: ShabbosLine) => `${TEFILLAH_LABELS[l.tefillah]} ${l.when}${l.note ? `, ${l.note.charAt(0).toLowerCase()}${l.note.slice(1)}` : ''}`
  const pairOf = (l: ShabbosLine) => {
    const pair = seasonPartner(l.row, minyanim)
    return pair && pair.days.includes(l.part === 'friday' ? 'fri' : 'sat') ? pair : null
  }
  const otherLine = otherSeasonLine(
    offSeason,
    (l) => l.row.season,
    (ls) => {
      const paired = ls.filter(pairOf).map((l) => `${l.part === 'friday' ? 'Friday' : 'Shabbos'}: ${said(l)} ${insteadOf(l.row, pairOf(l)!)}`)
      const extra = ls.filter((l) => !pairOf(l))
      return [...paired, ...(extra.length ? [`also ${extra.map(said).join('; ')}`] : [])].join('; ')
    },
  )
  return { lines, otherSeason: otherLine }
}
