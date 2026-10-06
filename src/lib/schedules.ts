import { DAY_KEYS, dayLabel, type DayKey } from './hours'
import { formatAnchorRule, isMinyanim, parseTimeToMinutes, SEASON_LABELS, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan, type MinyanDayKey } from './davening'
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
  /** 'week': one week's times the shul sent out (a Shabbos post), from
   *  “Update their times”; absent for a Yom Tov schedule (Oct 6). */
  kind?: 'week'
  /** When a week's times were added, ISO. */
  postedAt?: string
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
    return [
      {
        id: x.id,
        name: x.name,
        from: x.from,
        to: x.to,
        mode: x.mode,
        minyanim,
        ...(x.kind === 'week' ? { kind: 'week' as const } : {}),
        ...(typeof x.postedAt === 'string' && !Number.isNaN(Date.parse(x.postedAt)) ? { postedAt: x.postedAt } : {}),
      },
    ]
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

// ── How a schedule reads ─────────────────────────────────────────────────────

/** "Fri Oct 2" for a date; "Sep 26" when the weekday doesn't matter. */
export function dateText(date: string, { weekday = false }: { weekday?: boolean } = {}): string {
  const d = new Date(`${date}T12:00:00Z`)
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return weekday ? `${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${md}` : md
}

/** "Yom Tov days", "Chol HaMoed", "Shabbos", "Fri Oct 2". */
export function scheduleDayText(on: ScheduleDay): string {
  if (on === 'yom_tov') return 'Yom Tov days'
  if (on === 'chol_hamoed') return 'Chol HaMoed'
  if ((DAY_KEYS as readonly string[]).includes(on)) return on === 'sat' ? 'Shabbos' : dayLabel(on as DayKey)
  return dateText(on, { weekday: true })
}

/**
 * Every schedule in full, for the moderation queue and its emails: its
 * name, dates and whether it replaces the regular times, then one line per
 * minyan with its days, time, season and note, as formatMinyanimSummary
 * gives the regular times. Every property a person wrote is in it, so a
 * changed time is a changed line (SubmissionCard.test's schedule guard).
 */
export function formatSchedulesSummary(schedules: readonly SpecialSchedule[]): string {
  if (schedules.length === 0) return '—'
  return schedules
    .map((s) => {
      const head = `${s.name} · ${dateText(s.from)} – ${dateText(s.to)} · ${s.mode === 'replace' ? 'in place of the regular times' : 'as well as the regular times'}`
      const lines = [...s.minyanim]
        .sort((a, b) => TEFILLAH_ORDER.indexOf(a.tefillah) - TEFILLAH_ORDER.indexOf(b.tefillah) || parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time))
        .map((m) => [TEFILLAH_LABELS[m.tefillah], m.on.map(scheduleDayText).join(', '), m.time, m.season && SEASON_LABELS[m.season], m.notes].filter(Boolean).join(' · '))
      return [head, ...lines.map((l) => `  ${l}`)].join('\n')
    })
    .join('\n')
}

// ── One schedule sent from a visitor ────────────────────────────────────────

const DAY = 86_400_000

/** One schedule as sent, held to sizes a real one never exceeds. A time
 *  set from sunset keeps its rule ("10 min before Sunset"), worked out
 *  again here from the minutes rather than taken as sent, so the words and
 *  the minutes can't disagree. Sunset only: the candle-lighting and
 *  havdalah times the guide has are the coming Shabbos's, not a Yom Tov
 *  date's (see SchedulesInput). */
export function cleanSchedule(raw: unknown, now = Date.now()): SpecialSchedule | null {
  const [s] = readSchedules([raw])
  if (!s) return null
  const minyanim = s.minyanim.filter((m) => m.time.trim()).slice(0, 60)
  if (minyanim.length === 0) return null
  if (s.name.trim().length < 2 || s.name.length > 60) return null
  const from = Date.parse(`${s.from}T12:00:00Z`)
  const to = Date.parse(`${s.to}T12:00:00Z`)
  // A festival's dates: not long past, not years off, not months long.
  if (from < now - 30 * DAY || from > now + 400 * DAY || to - from > 31 * DAY) return null
  if (minyanim.some((m) => m.time.length > 40 || (m.notes?.length ?? 0) > 120 || m.on.length > 40)) return null
  const fromSunset = (m: ScheduleMinyan) =>
    m.anchor === 'sunset' && Number.isInteger(m.offsetMinutes ?? 0) && Math.abs(m.offsetMinutes ?? 0) <= 240 ? (m.offsetMinutes ?? 0) : null
  return {
    id: s.id.slice(0, 64),
    name: s.name.trim(),
    from: s.from,
    to: s.to,
    mode: s.mode,
    minyanim: minyanim.map((m) => ({
      id: String(m.id).slice(0, 64),
      tefillah: m.tefillah,
      on: m.on,
      ...(fromSunset(m) !== null
        ? { time: formatAnchorRule('sunset', fromSunset(m)!), anchor: 'sunset' as const, offsetMinutes: fromSunset(m)! }
        : { time: m.time.trim() }),
      ...(m.notes?.trim() ? { notes: m.notes.trim() } : {}),
    })),
  }
}

// ── A shul's weekly schedule (Oct 6) ────────────────────────────────────────

const DAY_MS = 86_400_000

/** Whether a shul sends out its times each week: at least two week posts
 *  ending in the last eight weeks. Worked out from what's stored, so nobody
 *  enters it; a shul that has never posted one never shows a waiting box. */
export function sendsWeekly(schedules: readonly SpecialSchedule[], today: string): boolean {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 56 * DAY_MS).toISOString().slice(0, 10)
  return schedules.filter((s) => s.kind === 'week' && s.to >= since).length >= 2
}

/** The week post for the week `today` is in (Sunday to Shabbos) that hasn't
 *  ended yet, if one was sent. */
export function thisWeeksPost(schedules: readonly SpecialSchedule[], today: string): SpecialSchedule | undefined {
  const d = new Date(`${today}T12:00:00Z`)
  const saturday = new Date(d.getTime() + (6 - d.getUTCDay()) * DAY_MS).toISOString().slice(0, 10)
  return schedules.filter((s) => s.kind === 'week' && s.to >= today && s.from <= saturday).sort((a, b) => a.from.localeCompare(b.from))[0]
}
