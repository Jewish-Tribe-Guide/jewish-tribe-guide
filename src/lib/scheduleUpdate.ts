import { DAY_KEYS, type DayKey } from './hours'
import { formatAnchorRule, parseTimeToMinutes, TEFILLAH_ORDER, type Minyan, type MinyanDayKey, type Tefillah, type ZmanAnchor } from './davening'
import { dateText, signUpGroup, weekKeepsHeading, type ScheduleDay, type SpecialSchedule } from './schedules'
import type { Season } from './season'

// ── Updating a shul's times from what it sent (agreed Oct 1) ────────────────
// The user's words: a shul that redoes its times doesn't want to "go one by
// one and compare what we have and what they now have. They just want to
// upload what they have and then they can do one action". It might be a
// whole new schedule, or one Shabbos's times someone wants on the site.
//
// The AI only reads the message (scheduleReader.ts). This compares what it
// read with the shul's times, day by day and tefillah by tefillah, and the
// person sees one thing: the shul's times as the guide will show them, with
// a changed time beside the one it replaces, a new one marked new, and one
// coming off crossed out with Keep beside it. Then Send, and an admin
// checks it.
//
// Agreed rules (Oct 1):
//   - A time comes off only when the message lists every minyan for the
//     days it covers: a whole schedule, or a Shabbos post that gives the
//     whole weekend. Otherwise everything not in it stays as it is.
//   - A clock time within 2 minutes of a rule ("at candle lighting", "30
//     min before sunset") on that date is that rule. Shuls round.
//   - A winter (or summer) schedule leaves the other season's times alone,
//     and a time the shul keeps all year that it changes for winter stays
//     for summer.
//   - "Winter only" / "Summer only" written in a note becomes the minyan's
//     season (and leaves the rest of the note), so the guide can tell.
//   - A one-off on a named date ("Thanksgiving, Thu Nov 26") stays on that
//     date, never becomes every Thursday.

export const SAME_WITHIN_MINUTES = 2

/** One time as the AI read it, tidied (scheduleReader.ts). Weekly times
 *  have `days`; a time tied to one date has `date`. */
export type ReadRegularTime = {
  id: string
  tefillah: Tefillah
  days: DayKey[]
  date?: string
  /** "Thanksgiving", for a one-off in a schedule. */
  occasion?: string
  time: string
  anchor?: ZmanAnchor
  offsetMinutes?: number
  notes?: string
  quote: string
  checked: boolean
  unsure?: string
  /** It runs only when enough people come ("held when there is sufficient
   *  interest", Mekor's newsletter, Oct 23): a sign-up minyan. */
  signUp?: true
  /** Where it's held, as written, when that isn't the shul itself ("at
   *  1818 Market or Mikveh Israel"): another shul's minyan the guide has
   *  already is left out (heldElsewhere.ts); else it's the shul's own,
   *  somewhere else, and this goes in its note. */
  where?: string
}

/** What a message is. `schedule`: the shul's usual times (perhaps for one
 *  season). `week`: the times for particular dates, usually one Shabbos. */
export type RegularReading = {
  kind: 'schedule' | 'week'
  /** Whether it lists every minyan for the days it covers, rather than a
   *  change or two. Only then does anything come off. */
  complete: boolean
  /** "Winter schedule": the season it's for. */
  season: Season | null
  /** "Shabbos Bereishis", "Winter Schedule". */
  title: string | null
  /** When a schedule starts, as written ("from Sun Nov 1"). */
  startsOn: string | null
  /** The dates a `week` message covers, inclusive. */
  from: string | null
  to: string | null
  times: ReadRegularTime[]
}

export type RowStatus = 'same' | 'changed' | 'new' | 'gone' | 'kept'

/** One line of the result: a time on one day as the guide will show it.
 *  `day` is a weekday for a schedule, a date for a week's times or a
 *  one-off. */
export type UpdateRow = {
  id: string
  day: DayKey | string
  tefillah: Tefillah
  time: string
  anchor?: ZmanAnchor
  offsetMinutes?: number
  notBefore?: string
  notAfter?: string
  notes?: string
  status: RowStatus
  /** The time it replaces, for a changed one. */
  was?: string
  /** The shul's own minyan it is, or replaces. */
  rowId?: string
  quote?: string
  unsure?: string
  occasion?: string
  /** For a time coming off: the person kept it. */
  keep?: boolean
  /** For a changed time in a week's message: their usual time now. */
  everyWeek?: boolean
  /** The season it's for, when the message gives both seasons' times
   *  (compareTimes). None: all year, or the message's own season. */
  season?: Season
  /** The message says it runs only when enough people sign up. */
  signUp?: true
}

export type TimesUpdate = {
  kind: RegularReading['kind']
  complete: boolean
  season: Season | null
  title: string | null
  startsOn: string | null
  from: string | null
  to: string | null
  rows: UpdateRow[]
  /** How many of the shul's times are the other season's, left alone. */
  otherSeason: number
}

/** A date's zmanim, as minutes from midnight. */
export type DayZmanim = { sunset?: number; candleLighting?: number; havdalah?: number }

// ── Seasons written in notes ────────────────────────────────────────────────

const SEASON_NOTE = /\b(winter|summer)\s+only\b[\s,;:.–—-]*/i

/** A minyan's season: its own, or the one its note gives ("Winter only"). */
export function seasonOf(m: Pick<Minyan, 'season' | 'notes'>): Season | undefined {
  if (m.season) return m.season
  const hit = m.notes?.match(SEASON_NOTE)
  return hit ? (hit[1].toLowerCase() as Season) : undefined
}

/** "Winter only- following Kiddush" → season winter, note "following
 *  Kiddush". A minyan with its season already set, or none in its note,
 *  comes back as it was. */
export function seasonFromNotes<T extends Pick<Minyan, 'season' | 'notes'>>(m: T): T {
  const hit = m.notes?.match(SEASON_NOTE)
  if (!hit) return m
  const season = m.season ?? (hit[1].toLowerCase() as Season)
  if (season !== hit[1].toLowerCase()) return m
  const notes = m.notes!.replace(SEASON_NOTE, '').replace(/^[\s,;:.–—-]+|[\s,;:.–—-]+$/g, '').trim()
  const rest = { ...m }
  delete rest.notes
  return { ...rest, season, ...(notes ? { notes } : {}) }
}

// ── Times ───────────────────────────────────────────────────────────────────

type Timed = Pick<Minyan, 'time' | 'anchor' | 'offsetMinutes' | 'notBefore' | 'notAfter'>

export const weekdayOf = (date: string): DayKey => DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Every date from `from` to `to`, at most 8. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 8; d = addDays(d, 1)) out.push(d)
  return out
}

/** A time's minutes from midnight on a date: a clock time, or a rule
 *  worked out from that date's zmanim. Null when it can't be. */
export function minutesOn(t: Timed, zm: DayZmanim | undefined): number | null {
  if (!t.anchor) {
    const m = parseTimeToMinutes(t.time)
    return Number.isFinite(m) ? m : null
  }
  const base = t.anchor === 'sunset' ? zm?.sunset : t.anchor === 'candle_lighting' ? zm?.candleLighting : zm?.havdalah
  if (base === undefined) return null
  let m = base + (t.offsetMinutes ?? 0)
  if (t.notBefore) m = Math.max(m, parseTimeToMinutes(t.notBefore))
  if (t.notAfter) m = Math.min(m, parseTimeToMinutes(t.notAfter))
  return m
}

/** Whether two times are the same minyan time: the same rule, the same
 *  clock time, or a clock time within two minutes of a rule on that date. */
export function sameTime(a: Timed, b: Timed, zm?: DayZmanim): boolean {
  if (a.anchor && b.anchor) {
    if (a.anchor !== b.anchor || (a.offsetMinutes ?? 0) !== (b.offsetMinutes ?? 0)) return false
    if ((a.notBefore ?? null) === (b.notBefore ?? null) && (a.notAfter ?? null) === (b.notAfter ?? null)) return true
    // "At candle lighting (not after 7:00 PM)" isn't the website's "around
    // candle-lighting" (Mekor, Oct 21): a usual time said another way is a
    // change. On a date, the same minute is the same time.
    const x = minutesOn(a, zm)
    const y = minutesOn(b, zm)
    return x !== null && y !== null && Math.abs(x - y) <= SAME_WITHIN_MINUTES
  }
  if (!a.anchor && !b.anchor) {
    const x = parseTimeToMinutes(a.time)
    const y = parseTimeToMinutes(b.time)
    return Number.isFinite(x) ? x === y : a.time.trim().toLowerCase() === b.time.trim().toLowerCase()
  }
  const x = minutesOn(a, zm)
  const y = minutesOn(b, zm)
  return x !== null && y !== null && Math.abs(x - y) <= SAME_WITHIN_MINUTES
}

const sortKey = (t: Timed, zm?: DayZmanim) => minutesOn(t, zm) ?? Infinity

// ── Comparing ───────────────────────────────────────────────────────────────

type Slot = { row: Minyan }

/**
 * One day's times for one tefillah, paired: the same ones first, then what's
 * left in time order as changes, then whatever's over as new (from the
 * message) or gone/kept (the shul's).
 */
function pairDay(
  day: string,
  current: Slot[],
  read: ReadRegularTime[],
  { complete, zm, newId }: { complete: boolean; zm?: DayZmanim; newId: () => string },
): UpdateRow[] {
  const out: UpdateRow[] = []
  const cur = [...current]
  const left: ReadRegularTime[] = []
  for (const r of read) {
    const i = cur.findIndex((c) => sameTime(c.row, r, zm))
    if (i === -1) {
      left.push(r)
      continue
    }
    const [c] = cur.splice(i, 1)
    out.push({ ...rowFrom(c.row, day, newId), status: 'same', quote: r.quote, ...(r.unsure ? { unsure: r.unsure } : {}), ...(r.signUp ? { signUp: true as const } : {}), ...timeOf(r, c.row) })
  }
  left.sort((a, b) => sortKey(a, zm) - sortKey(b, zm))
  cur.sort((a, b) => sortKey(a.row, zm) - sortKey(b.row, zm))
  for (const r of left) {
    const c = cur.shift()
    out.push({
      id: newId(),
      day,
      tefillah: r.tefillah,
      ...pickTime(r),
      ...(r.notes ? { notes: r.notes } : c?.row.notes ? { notes: c.row.notes } : {}),
      status: c ? 'changed' : 'new',
      ...(c ? { was: c.row.time, rowId: c.row.id } : {}),
      quote: r.quote,
      ...(r.unsure ? { unsure: r.unsure } : {}),
      ...(r.occasion ? { occasion: r.occasion } : {}),
      ...(r.signUp ? { signUp: true as const } : {}),
    })
  }
  for (const c of cur) out.push({ ...rowFrom(c.row, day, newId), status: complete ? 'gone' : 'kept' })
  return out
}

/** A matched time shows as the message gives it when that's a clock time
 *  for a date (6:12 PM this Friday), and as the shul's rule otherwise. */
function timeOf(r: ReadRegularTime, row: Minyan): Partial<UpdateRow> {
  return r.date && !r.anchor && row.anchor ? { time: r.time, anchor: undefined, offsetMinutes: undefined, notBefore: undefined, notAfter: undefined } : {}
}

function pickTime(t: Timed): Timed {
  return {
    time: t.time,
    ...(t.anchor ? { anchor: t.anchor, offsetMinutes: t.offsetMinutes ?? 0 } : {}),
    ...(t.notBefore ? { notBefore: t.notBefore } : {}),
    ...(t.notAfter ? { notAfter: t.notAfter } : {}),
  }
}

function rowFrom(m: Minyan, day: string, newId: () => string): Omit<UpdateRow, 'status'> {
  return { id: newId(), day, tefillah: m.tefillah, ...pickTime(m), ...(m.notes ? { notes: m.notes } : {}), rowId: m.id }
}

/**
 * What the message changes, as the shul's times will read: every time on
 * every day it covers, each marked. `season` is the community's season now,
 * for a message that doesn't name one. `zmanim` are the covered dates'
 * (for a week's message), to match "6:12" with "at candle lighting".
 */
export function compareTimes(
  current: readonly Minyan[],
  reading: RegularReading,
  { season, zmanim = {}, newId = () => crypto.randomUUID() }: { season: Season | null; zmanim?: Record<string, DayZmanim>; newId?: () => string },
): TimesUpdate {
  // Usual times that say which are each season's ("7:00 PM · Summer"
  // beside "around candle-lighting · Winter", Mekor's website, Oct 21) are
  // the whole year's: compared season by season, each row marked with its
  // season, and one the same in both left all year. The website wins, said
  // its way (the user, Oct 21: "we really want to mimic the website").
  if (reading.kind === 'schedule' && !reading.season && reading.times.some((t) => seasonOf({ notes: t.notes }))) {
    const pass = (s: Season) =>
      compareTimes(current, { ...reading, season: s, times: reading.times.filter((t) => (seasonOf({ notes: t.notes }) ?? s) === s) }, { season: s, zmanim, newId }).rows
    const summer = pass('summer')
    const winter = pass('winter')
    const inWinter = new Set(winter.map(rowKey))
    const allYear = new Set(summer.map(rowKey).filter((k) => inWinter.has(k)))
    const rows = [
      ...summer.map((r): UpdateRow => (allYear.has(rowKey(r)) ? r : { ...r, season: 'summer' })),
      ...winter.filter((r) => !allYear.has(rowKey(r))).map((r): UpdateRow => ({ ...r, season: 'winter' })),
    ]
    const at = (r: UpdateRow) => [DAY_KEYS.indexOf(r.day as DayKey) === -1 ? 7 : DAY_KEYS.indexOf(r.day as DayKey), TEFILLAH_ORDER.indexOf(r.tefillah)]
    rows.sort((a, b) => at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1] || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    return { kind: 'schedule', complete: reading.complete, season: null, title: reading.title, startsOn: reading.startsOn, from: null, to: null, rows, otherSeason: 0 }
  }
  // A schedule is for a season: the other season's times are left alone.
  // A week's times are what's happening those days, whatever the season:
  // compared with all the shul's times, since the guide's season (from the
  // clock change) isn't always the shul's ("Winter only" can start in
  // October).
  const target = reading.kind === 'schedule' ? (reading.season ?? season) : null
  const inScope = (m: Minyan) => {
    const s = seasonOf(m)
    return !s || !target || s === target
  }
  const scoped = current.filter(inScope)
  // And what was read for the other season ("7:00 PM · Summer" in a
  // table beside "around candle-lighting · Winter", Mekor's website, Oct
  // 21) isn't compared: the listing's own times for it were left out above,
  // so it would come out as new. Said their way, not the listing's, it's a
  // change to suggest (the user, Oct 21: "if they say it one way we can
  // adjust and show it on our site that way").
  const readInScope = (t: ReadRegularTime) => inScope({ notes: t.notes } as Minyan)
  const rows: UpdateRow[] = []
  const pair = (day: string, weekday: DayKey, read: ReadRegularTime[], zm?: DayZmanim) => {
    for (const tefillah of TEFILLAH_ORDER) {
      const c = scoped.filter((m) => m.tefillah === tefillah && m.days.includes(weekday)).map((row) => ({ row }))
      const r = read.filter((t) => t.tefillah === tefillah && readInScope(t))
      if (c.length || r.length) rows.push(...pairDay(day, c, r, { complete: reading.complete, zm, newId }))
    }
  }

  if (reading.kind === 'week' && reading.from && reading.to) {
    for (const date of datesBetween(reading.from, reading.to)) {
      pair(date, weekdayOf(date), reading.times.filter((t) => t.date === date), zmanim[date])
    }
  } else {
    for (const day of DAY_KEYS) pair(day, day, reading.times.filter((t) => !t.date && t.days.includes(day)))
    // One-offs on a named date stay on that date.
    for (const t of reading.times.filter((x) => x.date)) {
      rows.push({
        id: newId(),
        day: t.date!,
        tefillah: t.tefillah,
        ...pickTime(t),
        ...(t.notes ? { notes: t.notes } : {}),
        status: 'new',
        quote: t.quote,
        ...(t.unsure ? { unsure: t.unsure } : {}),
        ...(t.occasion ? { occasion: t.occasion } : {}),
        ...(t.signUp ? { signUp: true as const } : {}),
      })
    }
  }
  return {
    kind: reading.kind,
    complete: reading.complete,
    season: reading.season,
    title: reading.title,
    startsOn: reading.startsOn,
    from: reading.from,
    to: reading.to,
    rows,
    otherSeason: current.length - scoped.length,
  }
}

/** A row, whatever its id: the same in both seasons' passes is all year. */
const rowKey = (r: UpdateRow) =>
  JSON.stringify([r.day, r.tefillah, r.status, r.rowId ?? null, r.time, r.anchor ?? null, r.offsetMinutes ?? null, r.notBefore ?? null, r.notAfter ?? null, r.notes ?? null, r.was ?? null, r.signUp ?? null])

/** Whether any time was read from what was sent: a read time is the same
 *  as one the guide has, a change to one or a new one. With none, the
 *  result is only the guide's own times, marked kept, and looked like a
 *  reading that agreed: Chabad Mainline's link, pasted bare, came back as
 *  "Everything matches what the guide has" (the user, Oct 23). */
export function readAnything(u: Pick<TimesUpdate, 'rows'>): boolean {
  return u.rows.some((r) => r.status === 'same' || r.status === 'changed' || r.status === 'new')
}

/** Whether a result changes anything: otherwise it only confirms. */
export function changesAnything(u: Pick<TimesUpdate, 'rows'>): boolean {
  return u.rows.some((r) => r.status === 'changed' || r.status === 'new' || (r.status === 'gone' && !r.keep))
}

// ── Applying it ─────────────────────────────────────────────────────────────

type DaySlot = Omit<Minyan, 'days' | 'id'> & { day: MinyanDayKey | null; from?: string }

const other = (s: Season): Season => (s === 'winter' ? 'summer' : 'winter')

function contentKey(m: Omit<Minyan, 'days' | 'id'>): string {
  const signUp = m.signUp ? [m.signUp.link ?? null, m.signUp.name ?? null, m.signUp.phone ?? null] : null
  return JSON.stringify([m.tefillah, m.time, m.anchor ?? null, m.offsetMinutes ?? null, m.notBefore ?? null, m.notAfter ?? null, m.notes ?? null, m.season ?? null, signUp, m.joinLink ?? null])
}

/** Slots back into minyanim: the same time on several days is one minyan,
 *  keeping the shul's own id where one is unchanged. */
function regroup(slots: DaySlot[], original: readonly Minyan[], newId: () => string): Minyan[] {
  const groups = new Map<string, { m: Omit<Minyan, 'days' | 'id'>; days: MinyanDayKey[]; from: Set<string> }>()
  for (const { day, from, ...m } of slots) {
    const key = contentKey(m)
    const g = groups.get(key) ?? { m, days: [], from: new Set<string>() }
    if (day && !g.days.includes(day)) g.days.push(day)
    if (from) g.from.add(from)
    groups.set(key, g)
  }
  const used = new Set<string>()
  const order = (d: MinyanDayKey) => {
    const i = (DAY_KEYS as readonly string[]).indexOf(d)
    return i === -1 ? 99 : i
  }
  return [...groups.values()].map(({ m, days, from }) => {
    days.sort((a, b) => order(a) - order(b))
    const own = original.find((o) => from.has(o.id) && !used.has(o.id) && contentKey(o) === contentKey(m))
    const id = own ? own.id : newId()
    used.add(id)
    return { id, ...m, days } as Minyan
  })
}

/** Days a schedule covers, as written: a date, a weekday, yom_tov… */
const coveredBy = (s: SpecialSchedule) => new Set(s.minyanim.flatMap((m) => m.on))

/**
 * A schedule into a shul's schedules: one of the same name is merged day by
 * day, so sending Shemini Atzeres's times keeps the Chol HaMoed ones already
 * there. Before this, a same-name schedule replaced the old one whole.
 * `expand` turns a day the old schedule names ("yom_tov", "fri") into its
 * dates, so a date the new one covers comes off it; without it, only the
 * same day named the same way is replaced.
 */
export function mergeSchedule(
  existing: readonly SpecialSchedule[],
  incoming: SpecialSchedule,
  expand: (day: ScheduleDay, s: SpecialSchedule) => string[] = (d) => [d],
): SpecialSchedule[] {
  const i = existing.findIndex((s) => s.name.toLowerCase() === incoming.name.toLowerCase())
  if (i === -1) return [...existing, incoming]
  const old = existing[i]
  // A week stands for every date in it: a day it has nothing for has
  // nothing, not what an earlier read of the same week had.
  const whole = incoming.kind === 'week' ? datesBetween(incoming.from, incoming.to) : []
  const covered = new Set([...coveredBy(incoming), ...whole].flatMap((d) => [d, ...expand(d, incoming)]))
  const kept = old.minyanim.flatMap((m) => {
    const on = m.on.flatMap((d) => {
      if (covered.has(d)) return []
      const dates = expand(d, old)
      return dates.some((x) => covered.has(x)) ? dates.filter((x) => !covered.has(x)) : [d]
    })
    return on.length ? [{ ...m, on: [...new Set(on)] }] : []
  })
  const merged: SpecialSchedule = {
    ...incoming,
    id: old.id,
    from: old.from < incoming.from ? old.from : incoming.from,
    to: old.to > incoming.to ? old.to : incoming.to,
    minyanim: [...kept, ...incoming.minyanim],
  }
  return existing.map((s, j) => (j === i ? merged : s))
}

/** The dates a week from the shul's newsletter (or a person) holds: what
 *  the website gives for those days gives way (the user, Oct 20). */
export function datesHeldOverWebsite(schedules: readonly SpecialSchedule[]): Set<string> {
  return new Set(schedules.filter((s) => s.kind === 'week' && s.postedBy !== 'website').flatMap((s) => datesBetween(s.from, s.to)))
}

/** The schedules with what the website gave on these dates taken off, and
 *  a website schedule left with nothing dropped. */
function withoutWebsiteDays(schedules: readonly SpecialSchedule[], dates: ReadonlySet<string>): SpecialSchedule[] {
  return schedules.flatMap((s) => {
    if (s.postedBy !== 'website' || !datesBetween(s.from, s.to).some((d) => dates.has(d))) return [s]
    const minyanim = s.minyanim.flatMap((m) => {
      const on = m.on.filter((d) => !dates.has(d))
      return on.length ? [{ ...m, on }] : []
    })
    const left = datesBetween(s.from, s.to).filter((d) => !dates.has(d))
    return minyanim.length && left.length ? [{ ...s, from: left[0], to: left.at(-1)!, minyanim }] : []
  })
}

/** "Mincha · Fri · 6:12 PM", for the admin's note. */
function rowText(r: UpdateRow): string {
  const day = (DAY_KEYS as readonly string[]).includes(r.day) ? (r.day === 'sat' ? 'Shabbos' : r.day[0].toUpperCase() + r.day.slice(1)) : dateText(r.day, { weekday: true })
  return `${r.tefillah.replace(/_/g, ' ')} · ${day}${r.occasion ? ` (${r.occasion})` : ''} · ${r.time}${r.signUp ? ' · only if enough sign up' : ''}`
}

/**
 * The shul's times with the result applied: its regular minyanim, and its
 * schedules with a week's dated one (and any one-offs) merged in. `rows`
 * come from the person, so only what they say about the shul's own
 * minyanim (by id and day) is used; anything else is ignored. `changes` is
 * the admin's summary, one line each.
 */
export function applyUpdate(
  current: readonly Minyan[],
  schedules: readonly SpecialSchedule[],
  update: Omit<TimesUpdate, 'otherSeason'>,
  {
    newId = () => crypto.randomUUID(),
    now = Date.now(),
    postedBy,
    name: weekName,
    evenIfSame = false,
  }: {
    newId?: () => string
    now?: number
    postedBy?: 'website'
    /** The week's name, in place of its dates from `from`: a calendar's
     *  week is named for the whole week, so reading it again on a later
     *  day merges with it (mergeSchedule). */
    name?: string
    /** Post the week even when every time is the usual one: a calendar's
     *  week is this week's schedule all the same (the user, Oct 20:
     *  "usual times doesn't read as reliable as something that says this
     *  is confirmed this week's schedule"). */
    evenIfSame?: boolean
  } = {},
): { minyanim: Minyan[]; schedules: SpecialSchedule[]; changes: string[] } {
  const changes: string[] = []
  // The shul's times, one per day, each remembering which minyan it was.
  let slots: DaySlot[] = current.flatMap(({ id, days, ...m }): DaySlot[] => (days.length ? days.map((day) => ({ ...m, day, from: id })) : [{ ...m, day: null, from: id }]))
  const seasonal = update.kind === 'schedule' ? update.season : null

  /** The shul's time on a day comes off; one it keeps all year stays for
   *  the other season when the message is one season's. */
  const takeOff = (r: UpdateRow, seasonal: Season | null): DaySlot | null => {
    const i = slots.findIndex((s) => s.from === r.rowId && s.day === r.day)
    if (i === -1) return null
    const s = slots[i]
    if (seasonal && !seasonOf(s)) slots[i] = { ...s, season: other(seasonal) }
    else slots = slots.filter((_, j) => j !== i)
    return s
  }
  // A sign-up minyan whose time changes is still a sign-up minyan: the
  // message gives its new time, not how it gets its ten. One the message
  // says is sign-up signs up where the usual one does (signUpGroup).
  const signUpOf = (r: UpdateRow, weekday: DayKey, was?: Pick<Minyan, 'signUp'>) => was?.signUp ?? (r.signUp ? signUpGroup(current, r.tefillah, [weekday]) : undefined)
  const add = (r: UpdateRow, season: Season | null, was?: DaySlot) => {
    const signUp = signUpOf(r, r.day as DayKey, was)
    slots.push({
      tefillah: r.tefillah,
      ...pickTime(r),
      ...(r.notes ? { notes: r.notes } : {}),
      ...(season ? { season } : {}),
      ...(signUp ? { signUp } : {}),
      day: r.day as DayKey,
    })
  }
  /** A dated row as a schedule's minyan, sign-up with its group. */
  const onDate = (r: UpdateRow) => {
    const signUp = signUpOf(r, weekdayOf(r.day))
    return { id: newId(), tefillah: r.tefillah, on: [r.day], ...pickTime(r), ...(r.notes ? { notes: r.notes } : {}), ...(signUp ? { signUp } : {}) }
  }

  const weekly = (r: UpdateRow) => (DAY_KEYS as readonly string[]).includes(r.day)
  const dated: UpdateRow[] = []

  if (update.kind === 'schedule') {
    for (const r of update.rows) {
      if (!weekly(r)) {
        if (r.status === 'new') dated.push(r)
        continue
      }
      // A row compared in one season (both seasons' times, compareTimes)
      // is that season's.
      const season = r.season ?? seasonal
      const was = r.status === 'changed' ? takeOff(r, season) : null
      if (was) {
        add(r, season, was)
        changes.push(`Changed: ${rowText(r)}, was ${r.was}${season ? ` (${season})` : ''}`)
      } else if (r.status === 'new') {
        add(r, season)
        changes.push(`New: ${rowText(r)}${season ? ` (${season})` : ''}`)
      } else if (r.status === 'gone' && !r.keep && takeOff(r, season)) {
        changes.push(`Off: ${rowText(r)}${season ? ` (for ${season})` : ''}`)
      }
    }
  } else {
    // A week's times: their usual time where the person said so…
    for (const r of update.rows) {
      if (r.status !== 'changed' || !r.everyWeek || !r.rowId) continue
      const day = weekdayOf(r.day)
      const i = slots.findIndex((s) => s.from === r.rowId && s.day === day)
      if (i === -1) continue
      const was = slots[i]
      slots = slots.filter((_, j) => j !== i)
      add({ ...r, day }, null, was)
      changes.push(`Every week from now: ${rowText({ ...r, day })}, was ${r.was}`)
    }
  }

  // "Winter only" in a note becomes the season.
  const minyanim = regroup(slots.map((s) => seasonFromNotes(s)), current, newId)
  let nextSchedules = [...schedules]

  // …and the week itself, dated, in place of the regular times those days.
  const posting = update.rows.some((r) => r.status !== 'gone' || r.keep)
  if (update.kind === 'week' && update.from && update.to && (changesAnything(update) || (evenIfSame && posting))) {
    const heading = weekKeepsHeading({ from: update.from, to: update.to }) ? update.title?.trim() : null
    const name = weekName || heading || `Times for ${dateText(update.from)}${update.to !== update.from ? ` – ${dateText(update.to)}` : ''}`
    const minyanimOn = update.rows.filter((r) => r.status !== 'gone' || r.keep).map(onDate)
    // A week from the newsletter or a person wins over one read off the
    // website for the same days (the user, Oct 20): the website's come off.
    if (!postedBy) nextSchedules = withoutWebsiteDays(nextSchedules, new Set(datesBetween(update.from, update.to)))
    nextSchedules = mergeSchedule(nextSchedules, {
      id: newId(),
      name: name.slice(0, 60),
      from: update.from,
      to: update.to,
      mode: 'replace',
      minyanim: minyanimOn,
      // A week the shul sent out, and when: “This week's schedule” (Oct 6).
      kind: 'week',
      postedAt: new Date(now).toISOString(),
      ...(postedBy ? { postedBy } : {}),
    })
    for (const r of update.rows) {
      if (r.status === 'changed') changes.push(`${name}: ${rowText(r)}, usually ${r.was}`)
      if (r.status === 'new') changes.push(`${name}: new, ${rowText(r)}`)
      if (r.status === 'gone' && !r.keep) changes.push(`${name}: not held, ${rowText(r)}`)
    }
    if (!changesAnything(update)) changes.push(`${name}: the same as their usual times, posted as this week’s schedule`)
  }

  // One-offs on their dates, as well as the regular times.
  const byDate = new Map<string, UpdateRow[]>()
  for (const r of dated) byDate.set(r.day, [...(byDate.get(r.day) ?? []), r])
  for (const [date, rs] of byDate) {
    const name = (rs.find((r) => r.occasion)?.occasion ?? dateText(date, { weekday: true })).slice(0, 60)
    nextSchedules = mergeSchedule(nextSchedules, {
      id: newId(),
      name,
      from: date,
      to: date,
      mode: 'add',
      minyanim: rs.map(onDate),
      ...(postedBy ? { postedBy } : {}),
    })
    for (const r of rs) changes.push(`New, that day only: ${rowText(r)}`)
  }

  if (current.some((m) => !m.season && seasonOf(m))) changes.push('Seasons set from the notes (“Winter only”, “Summer only”).')
  return { minyanim, schedules: nextSchedules, changes }
}


// ── What a browser sends ────────────────────────────────────────────────────

const STATUSES: RowStatus[] = ['same', 'changed', 'new', 'gone', 'kept']
const ANCHORS: ZmanAnchor[] = ['sunset', 'candle_lighting', 'havdalah']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/
const DAY_MS = 86_400_000

const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)

/**
 * A result as sent back to be filed, held to what one could really be:
 * known tefillos and statuses, weekdays or dates near today, times and
 * notes of sane length, a week of at most 8 days. Null for anything else.
 * Rules keep their words in step with their minutes (formatAnchorRule),
 * so the two can't disagree in the queue.
 */
export function cleanUpdate(raw: unknown, now = Date.now()): Omit<TimesUpdate, 'otherSeason'> | null {
  if (!raw || typeof raw !== 'object') return null
  const x = raw as Record<string, unknown>
  const kind = x.kind === 'week' ? 'week' : x.kind === 'schedule' ? 'schedule' : null
  if (!kind || !Array.isArray(x.rows) || x.rows.length === 0 || x.rows.length > 120) return null
  const near = (d: string) => {
    const t = Date.parse(`${d}T12:00:00Z`)
    return t > now - 8 * DAY_MS && t < now + 400 * DAY_MS
  }
  const isDay = (d: unknown): d is string => (DAY_KEYS as readonly unknown[]).includes(d) || (typeof d === 'string' && ISO_DATE.test(d) && near(d))
  const from = typeof x.from === 'string' && ISO_DATE.test(x.from) && near(x.from) ? x.from : null
  const to = typeof x.to === 'string' && ISO_DATE.test(x.to) && near(x.to) ? x.to : null
  if (kind === 'week' && (!from || !to || from > to || datesBetween(from, to).at(-1) !== to)) return null
  const rows: UpdateRow[] = []
  for (const r of x.rows as unknown[]) {
    if (!r || typeof r !== 'object') return null
    const y = r as Record<string, unknown>
    const tefillah = TEFILLAH_ORDER.find((t) => t === y.tefillah)
    const status = STATUSES.find((t) => t === y.status)
    const time = s(y.time, 40)
    if (!tefillah || !status || !time || !isDay(y.day)) return null
    if (kind === 'week' && (y.day < from! || y.day > to!)) return null
    const anchor = ANCHORS.find((a) => a === y.anchor)
    const offset = typeof y.offsetMinutes === 'number' && Number.isInteger(y.offsetMinutes) && Math.abs(y.offsetMinutes) <= 240 ? y.offsetMinutes : 0
    const notBefore = typeof y.notBefore === 'string' && HHMM.test(y.notBefore) ? y.notBefore : undefined
    const notAfter = typeof y.notAfter === 'string' && HHMM.test(y.notAfter) ? y.notAfter : undefined
    rows.push({
      id: s(y.id, 64) ?? crypto.randomUUID(),
      day: y.day,
      tefillah,
      ...(anchor
        ? { anchor, offsetMinutes: offset, ...(notBefore ? { notBefore } : {}), ...(notAfter ? { notAfter } : {}), time: formatAnchorRule(anchor, offset, { notBefore, notAfter }) }
        : { time }),
      ...(s(y.notes, 120) ? { notes: s(y.notes, 120) } : {}),
      status,
      ...(s(y.was, 60) ? { was: s(y.was, 60) } : {}),
      ...(s(y.rowId, 64) ? { rowId: s(y.rowId, 64) } : {}),
      ...(s(y.occasion, 40) ? { occasion: s(y.occasion, 40) } : {}),
      ...(y.keep === true ? { keep: true } : {}),
      ...(y.everyWeek === true ? { everyWeek: true } : {}),
      ...(y.signUp === true ? { signUp: true as const } : {}),
    })
  }
  return {
    kind,
    complete: x.complete === true,
    season: x.season === 'winter' || x.season === 'summer' ? x.season : null,
    title: s(x.title, 60) ?? null,
    startsOn: typeof x.startsOn === 'string' && ISO_DATE.test(x.startsOn) ? x.startsOn : null,
    from: kind === 'week' ? from : null,
    to: kind === 'week' ? to : null,
    rows,
  }
}

/**
 * The dates a schedule's day means, within that schedule: a date itself, a
 * weekday's dates, or the festival's Yom Tov / Chol HaMoed days. For
 * mergeSchedule, so a date sent now comes off "Chol HaMoed" in the one
 * already there. Without the festival's days, Yom Tov and Chol HaMoed stay
 * as named.
 */
export function scheduleDayDates(day: ScheduleDay, s: Pick<SpecialSchedule, 'from' | 'to'>, festivalDays: readonly { date: string; yomTov: boolean; cholHamoed: boolean }[] = []): string[] {
  if (ISO_DATE.test(day)) return [day]
  const within = (d: string) => d >= s.from && d <= s.to
  if (day === 'yom_tov' || day === 'chol_hamoed') {
    const dates = festivalDays.filter((f) => within(f.date) && (day === 'yom_tov' ? f.yomTov : f.cholHamoed)).map((f) => f.date)
    return dates.length ? dates : [day]
  }
  const out: string[] = []
  for (let d = s.from; d <= s.to && out.length < 40; d = addDays(d, 1)) if (weekdayOf(d) === day) out.push(d)
  return out
}
