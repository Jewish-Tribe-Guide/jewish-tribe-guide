import { DAY_KEYS, dayLabel, type DayKey } from './hours'
import { formatAnchorRule, isMinyanim, joinText, parseTimeToMinutes, SEASON_LABELS, signUpText, TEFILLAH_LABELS, TEFILLAH_ORDER, type Minyan, type MinyanDayKey } from './davening'
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

// A week's minyan may say it runs only when enough people sign up (Mekor's
// newsletter: "held when there is sufficient interest", the user, Oct 23),
// with the group its usual minyan uses (signUpGroup). Absent, a week's
// minyan runs under its usual one's (usualSignUp).
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
  /** 'website': read off the shul's own website or calendar (listingPageRun.ts).
   *  A week from anywhere else (its newsletter, a person) wins over it for
   *  the same days (the user, Oct 20). */
  postedBy?: 'website'
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
        ...(x.postedBy === 'website' ? { postedBy: 'website' as const } : {}),
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
export type DayPosting = { kind: 'schedule'; name: string; thisWeek?: true } | { kind: 'not-posted'; festival: string } | { kind: 'regular' }

export type DayResolution = { rows: ScheduledMinyan[]; skip: boolean; posting: DayPosting }

/**
 * What a shul has on one date: the schedule rows held that day (keyed to
 * it), whether its regular rows step aside, and whose times they are.
 */
export function resolveDay(regular: readonly Minyan[], schedules: readonly SpecialSchedule[], d: DateFacts): DayResolution {
  const covers = schedules.filter((s) => s.from <= d.date && d.date <= s.to)
  // A one-day addition (a calendar's dated service) is as well as whatever
  // else the day has: it used to win as the latest-starting schedule, and a
  // Thursday minyan on Chol HaMoed put the Sukkos times off that day.
  const additions = covers.filter(isOneDayAddition)
  const covering = firstCovering(covers.filter((s) => !isOneDayAddition(s))) ?? additions[0]
  const added = covering && !isOneDayAddition(covering) ? additions.flatMap((s) => rowsOn(s, regular, d)) : []
  const festival = d.yomTov || d.cholHamoed ? (d.festival ?? d.name) : null
  // A shul that already tags regular rows "Yom Tov" has posted for it.
  const taggedYomTov = d.yomTov === true && regular.some((m) => m.days.includes('yom_tov'))
  if (covering) {
    const week = covering.kind === 'week'
    const rows = rowsOn(covering, regular, d)
    if (rows.length > 0)
      return { rows: [...rows, ...added], skip: covering.mode === 'replace', posting: { kind: 'schedule', name: covering.name, ...(week && weekByDates(covering) ? { thisWeek: true as const } : {}) } }
    // Nothing for this day in a schedule that replaces the regular times:
    // the regular ones, but not presented as the festival's. A week the
    // shul sent out that leaves a day out (a website's calendar giving only
    // Shabbos morning) leaves it its usual times, plainly: it said "Times
    // for Oct 18 – Oct 24 times not posted" on Kol Tzedek's Thursday (the
    // user, Oct 22).
    if (covering.mode === 'replace' && week && !festival) return { rows: added, skip: false, posting: added.length > 0 ? { kind: 'schedule', name: additions[0].name } : { kind: 'regular' } }
    if (covering.mode === 'replace') return { rows: added, skip: false, posting: { kind: 'not-posted', festival: festival ?? covering.name } }
    if (added.length > 0) return { rows: added, skip: false, posting: { kind: 'schedule', name: additions[0].name } }
  }
  if (festival && !taggedYomTov) return { rows: [], skip: false, posting: { kind: 'not-posted', festival } }
  return { rows: [], skip: false, posting: { kind: 'regular' } }
}

/** Of the schedules covering a date, the one whose times it has: one
 *  from the newsletter or a person over one read off the website (the
 *  user, Oct 20: the newsletter wins), then the latest-starting, so a
 *  "Shemini Atzeres" one posted inside a "Sukkos" one wins on its days. */
function firstCovering(covers: readonly SpecialSchedule[]): SpecialSchedule | undefined {
  return [...covers].sort((a, b) => Number(a.postedBy === 'website') - Number(b.postedBy === 'website') || b.from.localeCompare(a.from))[0]
}

/** One day's times as well as the usual ones: a calendar's dated service,
 *  or a one-off a message gave. Not a week the shul sent out. */
export function isOneDayAddition(s: SpecialSchedule): boolean {
  return s.kind !== 'week' && s.mode === 'add' && s.from === s.to
}

/** A schedule's minyanim held on the date, keyed to it. */
function rowsOn(s: SpecialSchedule, regular: readonly Minyan[], d: DateFacts): ScheduledMinyan[] {
  const week = s.kind === 'week'
  return s.minyanim
    .filter((m) => heldOn(m, d))
    .map(({ on: _on, ...m }): ScheduledMinyan => {
      void _on
      const signUp = week ? usualSignUp(regular, m, [d.weekday]) : undefined
      return { ...m, ...(signUp ? { signUp } : {}), days: [dateKey(d.date)], schedule: s.name }
    })
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
        .map((m) => [TEFILLAH_LABELS[m.tefillah], m.on.map(scheduleDayText).join(', '), m.time, m.season && SEASON_LABELS[m.season], m.signUp && signUpText(m.signUp), m.joinLink && joinText(m.joinLink), m.notes].filter(Boolean).join(' · '))
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

/** The dates a schedule covers, in order. */
function datesOf(s: Pick<SpecialSchedule, 'from' | 'to'>): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${s.from}T12:00:00Z`); t <= Date.parse(`${s.to}T12:00:00Z`); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

const weekdayOfDate = (date: string): DayKey => DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

/** The weekdays a week post covers, Sunday first: the days its minyanim
 *  can be put on when it's edited. */
export function weekPostDays(post: Pick<SpecialSchedule, 'from' | 'to'>): DayKey[] {
  const days = new Set(datesOf(post).map(weekdayOfDate))
  return DAY_KEYS.filter((d) => days.has(d))
}

/** Whether a week's heading can name it: only when the week is just a
 *  Shabbos (its dates all Friday or Shabbos). A newsletter's first heading
 *  ("Shabbat Schedule") over a whole week's weekday times named the week
 *  for the part it wasn't (Mekor, Oct 18), so a longer week goes by its
 *  dates. */
export function weekKeepsHeading(post: Pick<SpecialSchedule, 'from' | 'to'>): boolean {
  return weekPostDays(post).every((d) => d === 'fri' || d === 'sat')
}

/** Whether a week goes by its dates rather than its name: one the guide
 *  named by them ("Times for Oct 18 – Oct 23"), or one longer than a
 *  Shabbos (weekKeepsHeading). Mekor's week was approved as "Shabbat
 *  Schedule" before weeks were named by their dates, and the Minyanim list
 *  called its Monday Maariv "Shabbat Schedule times" (the user, Oct 19). */
export function weekByDates(post: Pick<SpecialSchedule, 'name' | 'from' | 'to'>): boolean {
  return /^times for /i.test(post.name) || !weekKeepsHeading(post)
}

/** The sign-up a week's minyan runs under: its own, else that of the usual
 *  minyan it stands in for, the same tefillah on one of its weekdays, in
 *  either season. A newsletter gives the times, not the WhatsApp group, so
 *  Mekor's week showed its weekday minyanim without the group every usual
 *  one has (the user, Oct 19). */
export function usualSignUp(regular: readonly Minyan[], m: { tefillah: Minyan['tefillah']; signUp?: Minyan['signUp'] }, weekdays: readonly DayKey[]): Minyan['signUp'] {
  if (m.signUp) return m.signUp
  return regular.find((r) => r.signUp && r.tefillah === m.tefillah && weekdays.some((d) => r.days.includes(d)))?.signUp
}

const SAME_CROWD: Partial<Record<Minyan['tefillah'], Minyan['tefillah'][]>> = {
  mincha_maariv: ['mincha', 'maariv'],
  mincha: ['mincha_maariv'],
  maariv: ['mincha_maariv'],
}

/** Tefillos that are the same minyan said another way: a newsletter's
 *  "Mincha followed by Maariv" is the usual weekday Maariv's crowd. */
export const sameCrowd = (a: Minyan['tefillah'], b: Minyan['tefillah']) => a === b || (SAME_CROWD[a] ?? []).includes(b)

/** The group a minyan read as sign-up signs up in: the usual minyan's for
 *  the same tefillah on one of its weekdays, else one that's the same
 *  crowd (Mincha & Maariv for a Maariv). Empty when the shul has none
 *  there: still sign-up, for an admin to give the group. */
export function signUpGroup(regular: readonly Minyan[], tefillah: Minyan['tefillah'], weekdays: readonly DayKey[]): NonNullable<Minyan['signUp']> {
  const on = (r: Minyan) => !!r.signUp && weekdays.some((d) => r.days.includes(d))
  return regular.find((r) => on(r) && r.tefillah === tefillah)?.signUp ?? regular.find((r) => on(r) && sameCrowd(tefillah, r.tefillah))?.signUp ?? {}
}

/** The join link a week's minyan has: its own, else that of the usual
 *  minyan it is, the same tefillah on one of its weekdays at the same
 *  time. A calendar or newsletter may give the time without the Zoom link
 *  the usual minyan has; a different time that day may be a minyan in the
 *  room only. */
export function usualJoinLink(regular: readonly Minyan[], m: Pick<Minyan, 'tefillah' | 'time' | 'joinLink'>, weekdays: readonly DayKey[]): string | undefined {
  if (m.joinLink) return m.joinLink
  const at = parseTimeToMinutes(m.time)
  if (!Number.isFinite(at)) return undefined
  return regular.find((r) => r.joinLink && r.tefillah === m.tefillah && weekdays.some((d) => r.days.includes(d)) && parseTimeToMinutes(r.time) === at)?.joinLink
}

/** A week post's minyanim as rows on weekdays, the way its box shows them
 *  and its Edit lists them. */
export function weekPostRows(post: SpecialSchedule): Minyan[] {
  return post.minyanim.flatMap((m) => {
    const days = m.on.flatMap((d) => (isDate(d) ? [weekdayOfDate(d)] : (DAY_KEYS as readonly string[]).includes(d) ? [d as DayKey] : []))
    if (days.length === 0) return []
    const { on: _on, ...rest } = m
    void _on
    return [{ ...rest, days: [...new Set(days)] }]
  })
}

// Field by field, whatever order they were set in.
const plainRow = (m: object) => JSON.stringify(Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined && v !== '').sort(([a], [b]) => a.localeCompare(b))))

/**
 * The shul's schedules with one week post's minyanim replaced by `rows`, as
 * edited (Oct 19: "This week's schedule" had no Edit). Each row goes back
 * on the post's own dates for its weekdays; a row nobody changed stays
 * exactly as stored, so opening the editor and sending nothing changes
 * nothing.
 */
export function withWeekRows(schedules: readonly SpecialSchedule[], postId: string, rows: readonly Minyan[]): SpecialSchedule[] {
  return schedules.map((post) => {
    if (post.id !== postId) return post
    const dates = datesOf(post)
    const stored = new Map(post.minyanim.map((m) => [m.id, m]))
    const minyanim = rows.flatMap((row): ScheduleMinyan[] => {
      const was = stored.get(row.id)
      if (was && weekPostRows({ ...post, minyanim: [was] }).some((r) => plainRow(r) === plainRow(row))) return [was]
      const on = dates.filter((d) => row.days.includes(weekdayOfDate(d)))
      if (on.length === 0) return []
      const { days: _days, ...rest } = row
      void _days
      return [{ ...rest, on }]
    })
    return { ...post, minyanim }
  })
}

/** The Shabbos that ends the week `today` is in. */
function saturdayOf(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  return new Date(d.getTime() + (6 - d.getUTCDay()) * DAY_MS).toISOString().slice(0, 10)
}

/** A time's minutes from midnight, or `rule` for one set by a zman ("at
 *  candle lighting"). */
function clockOf(time: string, rule: number): number {
  const m = parseTimeToMinutes(time)
  return Number.isFinite(m) ? m : rule
}

/** Whether two times as written are the same time: "8:10 AM", "8:10am". */
const sameClock = (a: string, b: string) => (Number.isFinite(parseTimeToMinutes(a)) ? parseTimeToMinutes(a) === parseTimeToMinutes(b) : a.trim().toLowerCase() === b.trim().toLowerCase())

/** One day of "This week's schedule": its date, the occasion it's named
 *  for ("Thanksgiving"), and its times, each with the post it's from. */
export type WeekDayTimes = { date: string; occasion: string | null; minyanim: { minyan: ScheduleMinyan; from: SpecialSchedule }[] }

/** "This week's schedule" (the user, Oct 20: "There's only one schedule
 *  for a given week"), day by day from today to Shabbos: on each day the
 *  week post that has it (the newsletter's over the website's, as
 *  resolveDay picks), then that day's one-day additions, less any time
 *  the week already gives. `posts` are the week posts it shows, the
 *  newsletter's first. Days with nothing are left out. */
export function thisWeeksDays(schedules: readonly SpecialSchedule[], today: string): { days: WeekDayTimes[]; posts: SpecialSchedule[] } {
  const saturday = saturdayOf(today)
  const weeks = schedules.filter((s) => s.kind === 'week' && s.to >= today && s.from <= saturday)
  const days: WeekDayTimes[] = []
  const used = new Set<SpecialSchedule>()
  for (const date of datesOf({ from: today, to: saturday })) {
    const weekday = weekdayOfDate(date)
    const post = firstCovering(weeks.filter((s) => s.from <= date && date <= s.to))
    const own = post ? post.minyanim.filter((m) => m.on.includes(date) || m.on.includes(weekday)).map((minyan) => ({ minyan, from: post })) : []
    if (own.length) used.add(post!)
    const extras = schedules.filter((s) => isOneDayAddition(s) && s.from === date)
    const added = extras.flatMap((s) =>
      s.minyanim
        .filter((m) => !own.some((o) => o.minyan.tefillah === m.tefillah && sameClock(o.minyan.time, m.time)))
        .map((minyan) => ({ minyan, from: s })),
    )
    const minyanim = [...own, ...added].sort(
      (a, b) => clockOf(a.minyan.time, 1440) - clockOf(b.minyan.time, 1440) || TEFILLAH_ORDER.indexOf(a.minyan.tefillah) - TEFILLAH_ORDER.indexOf(b.minyan.tefillah),
    )
    if (!minyanim.length) continue
    const named = extras.find((s) => s.name !== dateText(date, { weekday: true }))
    days.push({ date, occasion: named?.name ?? null, minyanim })
  }
  const posts = weeks.filter((s) => used.has(s)).sort((a, b) => Number(a.postedBy === 'website') - Number(b.postedBy === 'website') || a.from.localeCompare(b.from))
  return { days, posts }
}
