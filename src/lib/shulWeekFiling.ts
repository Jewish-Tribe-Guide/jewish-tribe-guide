import { TEFILLAH_LABELS, type Minyan, type Tefillah } from './davening'
import { scheduleDayDates, weekdayOf } from './scheduleUpdate'
import { dateText, type ScheduleMinyan, type SpecialSchedule } from './schedules'
import { partDates, partOf, PARTS, type DatedTime, type Finding, type HeldWeek, type Part, type SourceRead, type WeekContext } from './shulTimes'

// ── A shul's week, as the listing keeps it ───────────────────────────────────
// shulTimes.ts decides, a part at a time, what a shul's sources say about a
// week. This is the step between that and the listing, pure: the listing's
// weeks as sources and as what's held, and a finding as the week schedule
// filed for it. listingPageRun.ts does the reading and the filing.

/** A schedule's minyanim on their dates, each date once. */
export function scheduleTimes(s: SpecialSchedule): DatedTime[] {
  return s.minyanim.flatMap((m) =>
    [...new Set(m.on.flatMap((d) => scheduleDayDates(d, s)))].map((date) => ({
      date,
      tefillah: m.tefillah,
      time: m.time,
      ...(m.anchor ? { anchor: m.anchor } : {}),
      ...(m.offsetMinutes != null ? { offsetMinutes: m.offsetMinutes } : {}),
      ...(m.notes ? { notes: m.notes } : {}),
      ...(m.joinLink ? { joinLink: m.joinLink } : {}),
    })),
  )
}

/** Whether a week schedule speaks for a part (its `parts`, else both). */
const speaksFor = (s: SpecialSchedule, part: Part) => !s.parts || s.parts.includes(part)

/** The listing's weeks that cover a part of the week. One with no `parts`
 *  (the newsletter's, a person's) covers a part it gives times in, or
 *  whose every day it spans: the Shtiebel's Friday-to-Saturday Shabbos
 *  overlaps Friday's Shacharis but says nothing of the weekdays. */
function covering(schedules: readonly SpecialSchedule[], part: Part, week: { from: string; to: string }): SpecialSchedule[] {
  const days = partDates(part, week)
  const first = days[0], last = days.at(-1)!
  const gives = (s: SpecialSchedule) => scheduleTimes(s).some((t) => t.date >= first && t.date <= last && partOf(t) === part)
  return schedules.filter((s) => s.kind === 'week' && speaksFor(s, part) && s.from <= last && s.to >= first && (s.parts || (s.from <= first && s.to >= last) || gives(s)))
}

/** What the listing holds for each part of a week: only a part a week on
 *  it covers. One with no minyanim is "no minyan", which isn't holding
 *  nothing. */
export function heldWeeks(schedules: readonly SpecialSchedule[], week: { from: string; to: string }): HeldWeek[] {
  return PARTS.flatMap((part) => {
    const on = covering(schedules, part, week)
    if (!on.length) return []
    return [{ part, times: on.flatMap(scheduleTimes).filter((t) => t.date >= week.from && t.date <= week.to && partOf(t) === part) }]
  })
}

/** The newsletter's weeks as sources: a week no website posted, on the
 *  listing or waiting in To do, is the newsletter's (or a person's, which
 *  is as good). Newsletters aren't stored, only what they gave. */
export function newsletterReads(schedules: readonly SpecialSchedule[], week: { from: string; to: string }): SourceRead[] {
  return schedules
    .filter((s) => s.kind === 'week' && !s.postedBy && s.from <= week.to && s.to >= week.from)
    .map((s) => ({
      source: { id: `week:${s.id}`, kind: 'newsletter' as const, label: s.name, at: s.postedAt ?? s.from },
      shape: 'schedule' as const,
      shows: { from: s.from, to: s.to },
      times: scheduleTimes(s).filter((t) => !s.parts || s.parts.includes(partOf(t))),
    }))
}

/** The parts a shul's newsletter gives most weeks: a part it gave in two
 *  or more of the last six weeks. Until a part has begun without it, a
 *  page's read of that part waits for it. */
export function newsletterGives(schedules: readonly SpecialSchedule[], today: string): Part[] {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 42 * 86_400_000).toISOString().slice(0, 10)
  const weeks = new Map<Part, Set<string>>()
  for (const s of schedules) {
    if (s.kind !== 'week' || s.postedBy || s.to < since) continue
    for (const t of scheduleTimes(s)) {
      const part = partOf(t)
      if (s.parts && !s.parts.includes(part)) continue
      const saturday = new Date(Date.parse(`${t.date}T12:00:00Z`) + (6 - new Date(`${t.date}T12:00:00Z`).getUTCDay()) * 86_400_000).toISOString().slice(0, 10)
      weeks.set(part, (weeks.get(part) ?? new Set()).add(saturday))
    }
  }
  return PARTS.filter((p) => (weeks.get(p)?.size ?? 0) >= 2)
}

/** The usual minyanim of a part on a date. */
function usualOn(usual: readonly Minyan[], date: string, part: Part): Minyan[] {
  return usual.filter((m) => m.days.includes(weekdayOf(date)) && partOf({ date, tefillah: m.tefillah, time: m.time, anchor: m.anchor }) === part)
}

const COMBINED: readonly Tefillah[] = ['mincha_maariv', 'kabbalas_shabbos']
const EVENING: readonly Tefillah[] = ['mincha', 'maariv', ...COMBINED]
const sameName = (a: Tefillah, b: Tefillah) => a === b || ((COMBINED.includes(a) || COMBINED.includes(b)) && EVENING.includes(a) && EVENING.includes(b))

/** The week a finding puts on the listing, for its part: its days, and
 *  every minyan on them, so it is whole over them. A usual minyan kept in
 *  it is its time only: a dated week never borrows the usual times' notes
 *  or join link (the user, Nov 5).
 *  - Taken: the part's days, the source's times. A day with none has no
 *    minyan.
 *  - Asked: only the days the source shows. Its times, and from a
 *    highlight the usual minyanim it doesn't mention, still on: a
 *    highlight never removes one. A schedule's missing ones are left off,
 *    which is what the admin is asked about. A cancelled day has
 *    nothing. */
export function findingWeek(f: Extract<Finding, { do: 'take' | 'ask' }>, ctx: Pick<WeekContext, 'week' | 'usual'>): { from: string; to: string; times: DatedTime[] } {
  const days = partDates(f.part, ctx.week)
  if (f.do === 'take') return { from: days[0], to: days.at(-1)!, times: f.times }
  const shown = days.filter((d) => d >= f.from.shows.from && d <= f.from.shows.to)
  const cancelled = (f.from.cancelled ?? []).filter((c) => shown.includes(c.date))
  const off = (t: { date: string; tefillah: Tefillah }) => cancelled.some((c) => c.date === t.date && (!c.tefillah || sameName(c.tefillah, t.tefillah)))
  const read = f.from.times.filter((t) => shown.includes(t.date) && partOf(t) === f.part && t.tefillah !== 'other' && !off(t))
  const kept =
    f.from.shape === 'highlight'
      ? shown.flatMap((date) =>
          usualOn(ctx.usual, date, f.part)
            .filter((m) => !read.some((t) => t.date === date && sameName(t.tefillah, m.tefillah)) && !off({ date, tefillah: m.tefillah }))
            .map((m) => ({
              date,
              tefillah: m.tefillah,
              time: m.time,
              ...(m.anchor ? { anchor: m.anchor } : {}),
              ...(m.offsetMinutes != null ? { offsetMinutes: m.offsetMinutes } : {}),
            })),
        )
      : []
  const times = [...read, ...kept].sort((a, b) => a.date.localeCompare(b.date))
  return { from: shown[0], to: shown.at(-1)!, times }
}

/** "Thu Nov 20 7:00 AM". */
const timeLine = (t: DatedTime) => `${TEFILLAH_LABELS[t.tefillah]} ${dateText(t.date, { weekday: true })} ${t.time}${t.notes ? ` (${t.notes})` : ''}`

/** What the admin is told of a finding, a line each: how the source was
 *  read, and for an ask, what isn't as usual. */
export function findingLines(f: Extract<Finding, { do: 'take' | 'ask' }>): string[] {
  const part = f.part === 'shabbos' ? 'Shabbos' : 'the weekdays'
  const heading = f.from.heading ? `, under “${f.from.heading}”` : ''
  if (f.do === 'take') return [`Their whole schedule for ${part}${heading}`, ...(f.asUsual ? ['The same as their usual times'] : []), ...f.quotes.map((q) => `They say: “${q}”`)]
  return [
    `${f.readAs}, for ${part}`,
    ...f.extra.map((t) => `Not usual: ${timeLine(t)}`),
    ...f.different.map((d) => `At another time: ${timeLine(d.read)}, usually ${d.usual.time}`),
    ...f.missing.map((m) => `Not on it: ${TEFILLAH_LABELS[m.minyan.tefillah]} ${dateText(m.date, { weekday: true })}, usually ${m.minyan.time}`),
    ...f.quotes.map((q) => `They say: “${q}”`),
  ]
}

/** A week's times as a schedule's minyanim: one per minyan, its dates
 *  together. */
function asMinyanim(times: readonly DatedTime[], newId: () => string): ScheduleMinyan[] {
  const byKey = new Map<string, ScheduleMinyan>()
  for (const t of times) {
    const key = JSON.stringify([t.tefillah, t.time, t.anchor ?? null, t.offsetMinutes ?? null, t.notes ?? null, t.joinLink ?? null])
    const had = byKey.get(key)
    if (had) {
      if (!had.on.includes(t.date)) had.on.push(t.date)
      continue
    }
    byKey.set(key, {
      id: newId(),
      tefillah: t.tefillah,
      time: t.time,
      ...(t.anchor ? { anchor: t.anchor } : {}),
      ...(t.offsetMinutes != null ? { offsetMinutes: t.offsetMinutes } : {}),
      ...(t.notes ? { notes: t.notes } : {}),
      ...(t.joinLink ? { joinLink: t.joinLink } : {}),
      on: [t.date],
    })
  }
  return [...byKey.values()]
}

/** "Times for Nov 22 – 28". */
export const weekScheduleName = (week: { from: string; to: string }) => `Times for ${dateText(week.from)} – ${dateText(week.to)}`

/** The same week whatever its ids and when it was posted. */
const sameSchedule = (a: SpecialSchedule, b: SpecialSchedule) => {
  const canon = (s: SpecialSchedule) =>
    JSON.stringify([s.from, s.to, s.whole ?? null, s.parts ?? null, s.minyanim.map((m) => JSON.stringify({ ...m, id: null, on: [...m.on].sort() })).sort()])
  return canon(a) === canon(b)
}

/** One part of a schedule: a website week that spoke for both, kept for
 *  the part it isn't being replaced in, over that part's days only. Kept
 *  over the whole week, Lower Merion's Shabbos half and its new weekdays
 *  were both Nov 22–27, and each was counted against the old week whole:
 *  "51 changes" in the nightly email (Nov 25). */
function onlyPart(s: SpecialSchedule, part: Part, week: { from: string; to: string }, newId: () => string): SpecialSchedule | null {
  const minyanim = s.minyanim.flatMap((m) => {
    const on = m.on.filter((d) => scheduleDayDates(d, s).some((date) => partOf({ date, tefillah: m.tefillah, time: m.time, anchor: m.anchor }) === part))
    return on.length ? [{ ...m, on }] : []
  })
  const days = partDates(part, week).filter((d) => d >= s.from && d <= s.to)
  if (!days.length || (!minyanim.length && !s.whole)) return null
  return { ...s, id: newId(), parts: [part], from: days[0], to: days.at(-1)!, minyanim }
}

/**
 * The listing's weeks with a page's findings for one week put on: each
 * finding a week schedule of its own, for its part, posted by the website,
 * in place of the website's earlier ones for that part (the newsletter's
 * and a person's are never touched). One the same as the listing's is
 * left as it is, so reading again files nothing. `lines`: what each new
 * schedule's finding says, by its id, for the admin.
 */
export function withFindings(
  schedules: readonly SpecialSchedule[],
  findings: readonly Finding[],
  ctx: Pick<WeekContext, 'week' | 'usual'>,
  { now, newId = () => crypto.randomUUID() }: { now: number; newId?: () => string },
): { schedules: SpecialSchedule[]; lines: Record<string, string[]> } {
  let out = [...schedules]
  const lines: Record<string, string[]> = {}
  for (const f of findings) {
    if (f.do === 'nothing') continue
    const { from, to, times } = findingWeek(f, ctx)
    if (!from) continue
    const next: SpecialSchedule = {
      id: newId(),
      name: weekScheduleName(ctx.week),
      from,
      to,
      mode: 'replace',
      kind: 'week',
      postedAt: new Date(now).toISOString(),
      postedBy: 'website',
      whole: true,
      parts: [f.part],
      minyanim: asMinyanim(times, newId),
    }
    const mine = covering(out, f.part, ctx.week).filter((s) => s.postedBy === 'website')
    if (mine.length === 1 && sameSchedule(mine[0], next)) continue
    const other = PARTS.find((p) => p !== f.part)!
    const keep = mine.flatMap((s) => (speaksFor(s, other) && s.from <= partDates(other, ctx.week).at(-1)! && s.to >= partDates(other, ctx.week)[0] ? [onlyPart(s, other, ctx.week, newId)] : [])).filter((s): s is SpecialSchedule => !!s)
    out = [...out.filter((s) => !mine.includes(s)), ...keep, next]
    lines[next.id] = findingLines(f)
  }
  return { schedules: out, lines }
}
