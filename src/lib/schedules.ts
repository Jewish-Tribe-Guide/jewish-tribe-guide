import { DAY_KEYS, type DayKey } from './hours'
import { isMinyanim, TEFILLAH_ORDER, type Minyan, type MinyanDayKey } from './davening'
import type { CalendarDay } from './jewishDays'

// ── Special schedules: a shul's Yom Tov times (step 4, agreed Oct 1) ────────
// A shul posts different times for a festival: "Sukkos 5787, Sep 26 – Oct
// 4", in place of its regular times or as well as them, with times for "Yom
// Tov days", "Chol HaMoed", a single date, or a weekday within it. Stored
// beside the shul's regular times, under the minyanim field's key with
// "_schedules" ("minyanim_schedules"), the way a grocery's "sometimes" items
// sit beside its items: no new kind of field, and nothing about how regular
// times are kept changes.
//
// What applies on a date (resolveDay): a schedule covering it, if any; on
// a festival day nothing covers, the regular times, marked "not posted",
// never presented as the festival's own. A "replaces" schedule that has
// nothing for one of its days says "not posted" for that day too, rather
// than guessing.

/** A day a schedule's minyan is held: a full Yom Tov day, a Chol HaMoed
 *  day (Hoshana Rabbah is one), a weekday within the schedule, or one date
 *  ("2026-10-02"). */
export type ScheduleDay = 'yom_tov' | 'chol_hamoed' | DayKey | string

export type ScheduleMinyan = Omit<Minyan, 'days'> & { on: ScheduleDay[] }

export type SpecialSchedule = {
  id: string
  /** "Sukkos 5787". */
  name: string
  /** YYYY-MM-DD, inclusive. */
  from: string
  to: string
  /** In place of the regular times, or as well as them. */
  mode: 'replace' | 'add'
  minyanim: ScheduleMinyan[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s)
const isScheduleDay = (d: unknown): d is ScheduleDay =>
  d === 'yom_tov' || d === 'chol_hamoed' || (DAY_KEYS as readonly unknown[]).includes(d) || isDate(d)

/** A listing's schedules, keeping only well-formed ones: anything else (a
 *  half-typed one, an old shape) is left out rather than half-applied. */
export function readSchedules(raw: unknown): SpecialSchedule[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s): SpecialSchedule[] => {
    if (!s || typeof s !== 'object') return []
    const x = s as Record<string, unknown>
    if (typeof x.id !== 'string' || typeof x.name !== 'string' || !isDate(x.from) || !isDate(x.to) || x.from > x.to) return []
    if (x.mode !== 'replace' && x.mode !== 'add') return []
    const minyanim = Array.isArray(x.minyanim)
      ? x.minyanim.filter(
          (m): m is ScheduleMinyan =>
            !!m &&
            typeof m === 'object' &&
            TEFILLAH_ORDER.includes((m as ScheduleMinyan).tefillah) &&
            typeof (m as ScheduleMinyan).time === 'string' &&
            Array.isArray((m as ScheduleMinyan).on) &&
            (m as ScheduleMinyan).on.length > 0 &&
            (m as ScheduleMinyan).on.every(isScheduleDay),
        )
      : []
    return [{ id: x.id, name: x.name, from: x.from, to: x.to, mode: x.mode, minyanim }]
  })
}

/** The detail key a minyanim field's schedules live under. */
export const schedulesKey = (minyanimKey: string) => `${minyanimKey}_schedules`

/** What's known about one date. `yomTov`/`cholHamoed` are null when the
 *  calendar hasn't said (an older cached answer, or past what it covers):
 *  never read as "an ordinary day". */
export type DateFacts = {
  date: string
  weekday: DayKey
  yomTov: boolean | null
  cholHamoed: boolean | null
  /** "Sukkos", for a day of the festival. */
  festival: string | null
  /** "Hoshana Rabbah", "Shemini Atzeres", "Chol HaMoed". */
  name: string | null
}

/** A date's facts from the calendar's days ahead (see jewishDays.ts).
 *  Within what the calendar covers, a date it doesn't name is ordinary. */
export function factsFor(date: string, days: readonly CalendarDay[] | undefined, daysThrough: string | undefined): DateFacts {
  const weekday = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]
  const known = !!days && !!daysThrough && date <= daysThrough
  const day = days?.find((d) => d.date === date)
  if (!known && !day) return { date, weekday, yomTov: null, cholHamoed: null, festival: null, name: null }
  return { date, weekday, yomTov: !!day?.yomTov, cholHamoed: !!day?.cholHamoed, festival: day?.festival ?? null, name: day?.name ?? null }
}

/** A schedule's minyan held on this date. */
function heldOn(m: ScheduleMinyan, d: DateFacts): boolean {
  return m.on.some((on) => on === d.date || on === d.weekday || (on === 'yom_tov' && d.yomTov === true) || (on === 'chol_hamoed' && d.cholHamoed === true))
}

/** The key a date's own minyanim are matched by, beside its weekday. */
export const dateKey = (date: string) => `date:${date}` as MinyanDayKey

/** A regular or schedule minyan, ready for the next-minyan logic: a
 *  schedule's own are keyed to their dates, and a regular one steps aside
 *  on the dates a "replaces" schedule covers. */
export type ScheduledMinyan = Minyan & {
  /** Dates a schedule replaces this regular minyan on. */
  skipDates?: string[]
  /** The schedule it comes from ("Sukkos 5787"). */
  schedule?: string
}

/** Whose times a shul has for a date: a schedule's, or its regular ones
 *  where a festival has none posted ("Sukkos"), or plainly its regular ones. */
export type DayPosting = { kind: 'schedule'; name: string } | { kind: 'not-posted'; festival: string } | { kind: 'regular' }

export type DayResolution = { rows: ScheduledMinyan[]; skip: boolean; posting: DayPosting }

/**
 * What a shul has on one date: the schedule rows held that day (keyed to
 * it), whether its regular rows step aside, and whose times they are.
 */
export function resolveDay(regular: readonly Minyan[], schedules: readonly SpecialSchedule[], d: DateFacts): DayResolution {
  // The latest-starting schedule that covers the date: a "Shemini Atzeres"
  // one posted inside a "Sukkos" one wins on its days.
  const covering = schedules.filter((s) => s.from <= d.date && d.date <= s.to).sort((a, b) => b.from.localeCompare(a.from))[0]
  const festival = d.yomTov || d.cholHamoed ? (d.festival ?? d.name) : null
  // A shul that already tags regular rows "Yom Tov" has posted for it.
  const taggedYomTov = d.yomTov === true && regular.some((m) => m.days.includes('yom_tov'))
  if (covering) {
    const rows = covering.minyanim
      .filter((m) => heldOn(m, d))
      .map(({ on: _on, ...m }): ScheduledMinyan => ({ ...m, days: [dateKey(d.date)], schedule: covering.name }))
    if (rows.length > 0) return { rows, skip: covering.mode === 'replace', posting: { kind: 'schedule', name: covering.name } }
    // Nothing for this day in a schedule that replaces the regular times:
    // the regular ones, but not presented as the festival's.
    if (covering.mode === 'replace') return { rows: [], skip: false, posting: { kind: 'not-posted', festival: festival ?? covering.name } }
  }
  if (festival && !taggedYomTov) return { rows: [], skip: false, posting: { kind: 'not-posted', festival } }
  return { rows: [], skip: false, posting: { kind: 'regular' } }
}

/**
 * A shul's minyanim with its schedules applied for the given dates: the
 * regular rows (skipping the dates a schedule replaces them on) and each
 * date's schedule rows, plus whose times each date has.
 */
export function withSchedules(
  regular: readonly Minyan[],
  schedules: readonly SpecialSchedule[],
  dates: readonly DateFacts[],
): { minyanim: ScheduledMinyan[]; posting: Record<string, DayPosting> } {
  const skip: string[] = []
  const extra: ScheduledMinyan[] = []
  const posting: Record<string, DayPosting> = {}
  for (const d of dates) {
    const r = resolveDay(regular, schedules, d)
    if (r.skip) skip.push(d.date)
    extra.push(...r.rows)
    posting[d.date] = r.posting
  }
  return {
    minyanim: [...regular.map((m): ScheduledMinyan => (skip.length ? { ...m, skipDates: skip } : m)), ...extra],
    posting,
  }
}

/** The regular minyanim a listing stores, as the next-minyan logic reads
 *  them. */
export function regularMinyanim(raw: unknown): Minyan[] {
  return isMinyanim(raw) ? (raw as Minyan[]) : []
}
