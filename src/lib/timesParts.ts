import type { Minyan } from './davening'
import { mergeMinyanimBox, minyanimForBox } from './minyanimBox'
import { seasonFromNotes } from './scheduleUpdate'
import { scheduleProposal, usualProposal } from './timesProposal'
import { regularMinyanim, readSchedules, schedulesKey, type SpecialSchedule } from './schedules'

// ── The three things a reading of a shul's website can change (Oct 21) ──────
// The user: "There are three possible shul times it's changing. Usual
// shabbos, usual weekday, this week. Readings should very clearly fall into
// one of those." So a page's reading is filed as up to three findings, one
// per part, each changing only its part and leaving the rest of the
// listing as it is. Sons of Israel's three pages (its calendar, its home
// page and its Tefillot page) were three overlapping proposals of the
// whole schedule; now its Shabbos is one proposal, its weekdays another,
// and this week a third.
//
// A part is applied to the listing as it is when it's approved
// (rebasePart), not as it was when it was read: using the Shabbos times
// never undoes weekday times approved a moment before.

export type TimesPart = 'weekday' | 'shabbos' | 'week'
export const TIMES_PARTS: readonly TimesPart[] = ['weekday', 'shabbos', 'week']
export const TIMES_PART_LABELS: Record<TimesPart, string> = {
  weekday: 'Usual weekday times',
  shabbos: 'Usual Shabbos times',
  week: 'This week’s schedule',
}

export const isTimesPart = (v: unknown): v is TimesPart => v === 'weekday' || v === 'shabbos' || v === 'week'

/** What a part finding carries in its source: which part, of which
 *  field, and for this week, the schedules it adds, changes or takes off
 *  (by id). */
export type PartSource = { part: TimesPart; field: string; schedules?: string[] }

/** A filer's statement of its part, if it made a well-formed one. */
export function readPartSource(v: unknown): PartSource | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (!isTimesPart(r.part) || typeof r.field !== 'string' || !r.field) return null
  const schedules = Array.isArray(r.schedules) ? r.schedules.filter((x): x is string => typeof x === 'string') : undefined
  return { part: r.part, field: r.field, ...(r.part === 'week' ? { schedules: schedules ?? [] } : {}) }
}

type Times = { minyanim: Minyan[]; schedules: SpecialSchedule[] }

/** The listing with one part as read, and the rest as it is. `ids`: for
 *  this week, the schedules the part is about. */
export function withPart(part: TimesPart, listing: Times, read: Times, ids?: readonly string[]): Times {
  if (part !== 'week') return { minyanim: mergeMinyanimBox(listing.minyanim, part, minyanimForBox(read.minyanim, part)), schedules: listing.schedules }
  const about = new Set(ids ?? weekIds(listing.schedules, read.schedules))
  return { minyanim: listing.minyanim, schedules: [...listing.schedules.filter((s) => !about.has(s.id)), ...read.schedules.filter((s) => about.has(s.id))] }
}

const timesOf = (details: Record<string, unknown>, key: string): Times => ({ minyanim: regularMinyanim(details[key]), schedules: readSchedules(details[schedulesKey(key)]) })
/** The same times whatever their ids and order, as filedBefore compares
 *  them (listingPageWatch.ts, which the admin page can't import). */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon).map((x) => JSON.stringify(x)).sort()
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k, x]) => k !== 'id' && k !== 'postedAt' && x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canon(x)]),
    )
  }
  return v ?? null
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

/** Each of the box's minyanim a day at a time, its "Winter only" note
 *  read as its season: Sun–Thu read as Sun and Mon–Thu is the same. */
const byDay = (rows: readonly Minyan[], box: 'weekday' | 'shabbos') => minyanimForBox(rows, box).flatMap((m) => m.days.map((d) => ({ ...seasonFromNotes(m), days: [d] })))

/** The schedules a reading adds, changes or takes off: by what they say,
 *  so the same week read again under a new id is no change. */
function weekIds(listing: readonly SpecialSchedule[], read: readonly SpecialSchedule[]): string[] {
  const has = (list: readonly SpecialSchedule[], s: SpecialSchedule) => list.some((o) => same(o, s))
  return [...new Set([...read.filter((s) => !has(listing, s)), ...listing.filter((s) => !has(read, s))].map((s) => s.id))]
}

export type PartReading = { part: TimesPart; details: Record<string, unknown>; source: PartSource; size: number }

/** A whole reading's details (the listing's, with the times as read), as
 *  the parts that change the listing: each with the listing's details, its
 *  part as read. `size`: how much of its part the website gives, so the
 *  page that gives more of it is the one proposed. */
export function splitParts(listingDetails: Record<string, unknown>, readDetails: Record<string, unknown>, key: string): PartReading[] {
  const listing = timesOf(listingDetails, key)
  const read = timesOf(readDetails, key)
  return TIMES_PARTS.flatMap((part): PartReading[] => {
    const ids = part === 'week' ? weekIds(listing.schedules, read.schedules) : undefined
    if (part === 'week' ? ids!.length === 0 : same(byDay(listing.minyanim, part), byDay(read.minyanim, part))) return []
    const t = withPart(part, listing, read, ids)
    const source: PartSource = { part, field: key, ...(ids ? { schedules: ids } : {}) }
    const details = { ...listingDetails, [key]: t.minyanim, [schedulesKey(key)]: t.schedules }
    return [{ part, details, source, size: partSize(source, details) }]
  })
}

/** A part finding's details, put on the listing as it is now: its part as
 *  it says (or as the admin edited it), everything else as the listing
 *  has it. */
export function rebasePart(source: PartSource, listingDetails: Record<string, unknown>, sentDetails: Record<string, unknown>): Record<string, unknown> {
  const key = source.field
  const sent = timesOf(sentDetails, key)
  // An admin's edit may add a schedule of its own: it's the part's too.
  const listed = new Set(readSchedules(listingDetails[schedulesKey(key)]).map((s) => s.id))
  const ids = source.part === 'week' ? [...(source.schedules ?? []), ...sent.schedules.filter((s) => !listed.has(s.id)).map((s) => s.id)] : undefined
  const t = withPart(source.part, timesOf(listingDetails, key), sent, ids)
  return { ...listingDetails, [key]: t.minyanim, [schedulesKey(key)]: t.schedules }
}

/** A part finding's part, as a fingerprint: the same times filed again,
 *  from this page or another, whatever their ids and order. */
export function partKey(source: PartSource, details: Record<string, unknown>): string {
  const t = timesOf(details, source.field)
  if (source.part !== 'week') return JSON.stringify(canon(byDay(t.minyanim, source.part)))
  const about = new Set(source.schedules)
  return JSON.stringify(canon(t.schedules.filter((s) => about.has(s.id))))
}

/** How much of its part a finding gives: its box's minyanim, or the
 *  week's. */
export function partSize(source: PartSource, details: Record<string, unknown>): number {
  const t = timesOf(details, source.field)
  if (source.part !== 'week') return minyanimForBox(t.minyanim, source.part).length
  const about = new Set(source.schedules)
  return t.schedules.filter((s) => about.has(s.id)).reduce((n, s) => n + s.minyanim.length, 0)
}

const SAY = { new: 'New', changed: 'Changed', gone: 'No longer there' } as const

/** What a part would change, a line each, for its note and the email:
 *  "Changed: Shacharis · Sat, 8:30 AM, was 9 AM". */
export function partLines(source: PartSource, listingDetails: Record<string, unknown>, details: Record<string, unknown>): string[] {
  const was = timesOf(listingDetails, source.field)
  const now = timesOf(details, source.field)
  if (source.part === 'week') {
    const { weeks, gone } = scheduleProposal(was.schedules, now.schedules, now.minyanim)
    return [...weeks.map((w) => `Posted: ${w.title}`), ...gone.map((g) => `Taken off: ${g}`)]
  }
  return usualProposal(was.minyanim, now.minyanim)
    .filter((b) => b.box === source.part)
    .flatMap((b) => b.rows)
    .flatMap((r) => (r.status === 'same' ? [] : [`${SAY[r.status]}: ${r.what}, ${r.when}${r.season ? ` in ${r.season.toLowerCase()}` : ''}${r.was?.when ? `, was ${r.was.when}` : ''}`]))
}

// ── Which parts a page gives (Reads, Oct 21) ────────────────────────────────
// Shul times' Reads names each page by the parts it gives ("Usual weekday
// times · Usual Shabbos times", "This week’s schedule"), and when two pages
// give the same part, the one that gives more is the one named, as
// fileParts files it. A page with times on it that gives no part another
// page doesn't give more of says "Nothing from it".

/** A part a page gave, and how many of its times. */
export type PartGiven = { part: TimesPart; size: number }

const DATED = /^\d{4}-\d{2}-\d{2}$/
/** One time's part: a dated one is this week's; Friday night and Saturday
 *  Shabbos's (minyanimForBox's split); Yom Tov neither's. */
function rowPart(day: string, shacharis: boolean, week: boolean): TimesPart | null {
  if (week || DATED.test(day)) return 'week'
  if (day === 'sat' || (day === 'fri' && !shacharis)) return 'shabbos'
  return day === 'yom_tov' ? null : 'weekday'
}

const tally = (found: Iterable<TimesPart | null>): PartGiven[] => {
  const size = new Map<TimesPart, number>()
  for (const p of found) if (p) size.set(p, (size.get(p) ?? 0) + 1)
  return TIMES_PARTS.flatMap((part) => (size.has(part) ? [{ part, size: size.get(part)! }] : []))
}

/** The parts a reading's times give: every time the page gave, not one the
 *  listing has that it didn't mention. */
export function partsGiven(updates: readonly { kind: string; rows: readonly { day: string; tefillah: string; status: string }[] }[]): PartGiven[] {
  return tally(updates.flatMap((u) => u.rows.filter((r) => r.status !== 'gone' && r.status !== 'kept').map((r) => rowPart(r.day, r.tefillah === 'shacharis', u.kind === 'week'))))
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const MONTH_DAY = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{1,2}\b/

/** A read line for one date ("Shacharis Thu Oct 22 8:10 AM"): this week's,
 *  not a usual time. */
export const isDatedLine = (line: string): boolean => MONTH_DAY.test(line)

/** The same from a check's read lines ("Shacharis Mon–Fri 6:45 AM",
 *  "Shacharis Wed Oct 21 6:45 AM"), for a page last read before checks
 *  kept their parts. A line counts once for each part its days touch. */
export function partsFromRead(lines: readonly string[]): PartGiven[] {
  return tally(
    lines.flatMap((line) => {
      if (isDatedLine(line)) return ['week' as const]
      const shacharis = /^Shacharis\b/.test(line)
      const days = new Set<string>()
      for (const m of line.matchAll(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:–(Sun|Mon|Tue|Wed|Thu|Fri|Sat))?\b/g)) {
        const from = SHORT_DAYS.indexOf(m[1] as (typeof SHORT_DAYS)[number])
        const to = m[2] ? SHORT_DAYS.indexOf(m[2] as (typeof SHORT_DAYS)[number]) : from
        for (let i = from; i <= to; i++) days.add(KEYS[i])
      }
      return [...new Set([...days].map((d) => rowPart(d, shacharis, false)))]
    }),
  )
}
