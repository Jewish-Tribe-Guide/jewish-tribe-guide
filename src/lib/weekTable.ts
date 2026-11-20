import { formatDays, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan, type MinyanDayKey, type Tefillah } from './davening'
import type { Season } from './season'
import { outOfSeason, seasonPartner } from './seasonPairs'
import { resolveAnchorTime, type AnchorTimes } from './useZmanAnchors'
import type { DayKey } from './hours'
import { clockMinutes, clockText, noteText, partOf, PART_ORDER, timeText, type ShabbosPart } from './minyanText'

// Lifted into minyanText.ts so the shul's box editor can use them without
// importing this file (see there); still exported from here as before.
export { clockMinutes, noteText, timeText, type ShabbosPart } from './minyanText'

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
   *  "15 min before sunset" with the row it came from, and every day a
   *  minyan with that rule is held, so the card gives today's time only on
   *  one of them. */
  rules: { text: string; row: Minyan; days: MinyanDayKey[] }[]
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
/** `perDay`: a row a day, as a shul's listing draws it (board 7e, Nov 19:
 *  Mon to Thu the same still four rows, so a day is found by reading down,
 *  never worked out from "Sun–Thu"). */
export function weekdayTable(minyanim: readonly Minyan[], season: Season | null, anchors?: AnchorTimes, { perDay = false }: { perDay?: boolean } = {}): WeekdayTable | null {
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
    const same = perDay ? undefined : rows.find((r) => JSON.stringify(r.parts) === key)
    if (same) same.days.push(day)
    else rows.push({ days: [day], label: '', cells, parts })
  }
  for (const r of rows) r.label = formatDays(r.days as MinyanDayKey[])

  const ruleDays = new Map<string, Set<MinyanDayKey>>()
  for (const m of now.filter((x) => x.anchor)) {
    const set = ruleDays.get(timeText(m)) ?? new Set<MinyanDayKey>()
    for (const d of m.days) set.add(d)
    ruleDays.set(timeText(m), set)
  }
  const rules = [...new Map(now.filter((m) => m.anchor).map((m) => [timeText(m), m])).entries()].map(([text, row]) => ({ text, row, days: [...ruleDays.get(text)!] }))

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

/** Today's clock time for each rule the weekday table uses ("10 min before
 *  sunset: 4:32 PM today."), only for a rule used today: a weekday Mincha's
 *  time said nothing true on Friday or Shabbos (Nov 18 review, item 11). */
export function ruleLinesToday(rules: WeekdayTable['rules'], today: DayKey | null, anchors: AnchorTimes | undefined): string[] {
  if (!today) return []
  return rules.flatMap((r) => {
    if (!r.days.includes(today)) return []
    const at = resolveAnchorTime(r.row, anchors)
    return at ? [`${r.text.charAt(0).toUpperCase()}${r.text.slice(1)}: ${at} today.`] : []
  })
}

// ── This week's weekdays, as a grid (board 5e, approved Nov 19) ────────────
// The same shape as the usual weekday table, but a row a date: Sun to Fri,
// days gone by kept (the card greys them), today marked. A column a
// tefillah the week has. A time with its own place or note gets a mark
// (†) and the note goes once under the grid, so the cells stay times.

export type WeekGridRow = {
  date: string
  /** "Thanksgiving": a day's own name, under its date. */
  occasion?: string | null
  /** The cells, a column each: the times, empty for none. */
  cells: { text: string; mark?: string; signUp?: boolean }[][]
}

export type WeekGrid = {
  columns: Tefillah[]
  rows: WeekGridRow[]
  /** "† At 1818 Market or Mikveh Israel", one per distinct note. */
  notes: { mark: string; text: string }[]
}

const MARKS = ['†', '‡', '§', '¶']

/** `days`: a week's dates, each with its minyanim on that date. Null when
 *  none has any. */
/** "7, 8 AM", as the usual table runs clock times together (joinTimes): a
 *  plain time drops its AM or PM when the next one in the cell says it. */
function sharedMeridiem<C extends { text: string; mark?: string; signUp?: boolean }>(cell: C, i: number, cells: readonly C[]): C {
  const next = cells[i + 1]
  const clock = /^(\d{1,2}(?::\d\d)?) ([AP]M)$/
  const own = cell.text.match(clock)
  const theirs = next?.text.match(clock)
  return own && theirs && own[2] === theirs[2] && !cell.mark && !cell.signUp ? { ...cell, text: own[1] } : cell
}

export function weekGrid(days: readonly { date: string; occasion?: string | null; rows: readonly Minyan[] }[]): WeekGrid | null {
  const all = days.flatMap((d) => d.rows)
  if (!all.length) return null
  const columns = TEFILLAH_ORDER.filter((t) => all.some((m) => m.tefillah === t))
  const notes: WeekGrid['notes'] = []
  const markOf = (m: Minyan) => {
    const text = noteText(m.notes)
    if (!text) return undefined
    const had = notes.find((n) => n.text.toLowerCase() === text.toLowerCase())
    if (had) return had.mark
    const i = notes.length
    const mark = i < MARKS.length ? MARKS[i] : `${MARKS[i % MARKS.length]}${MARKS[i % MARKS.length]}`
    notes.push({ mark, text })
    return mark
  }
  const rows = days.map((d) => ({
    date: d.date,
    occasion: d.occasion ?? null,
    cells: columns.map((t) =>
      d.rows
        .filter((m) => m.tefillah === t)
        .sort((a, b) => (clockMinutes(a.time) ?? 1440) - (clockMinutes(b.time) ?? 1440))
        .map((m) => {
          const mark = markOf(m)
          return { text: timeText(m), ...(mark ? { mark } : {}), ...(m.signUp ? { signUp: true } : {}) }
        })
        .map(sharedMeridiem),
    ),
  }))
  return { columns, rows, notes }
}
