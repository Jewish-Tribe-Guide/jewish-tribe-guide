import type { Minyan } from './davening'
import { dateText, weekPostRows, withWeekRows, type SpecialSchedule } from './schedules'

// ── This week's schedule, added in Edit listing (agreed Oct 23) ─────────────
// Drawing SwWk3BLEYTtVu2k3w2UJ5s v3. Any shul's Edit listing has a "This
// week's schedule" row: the times the guide has dated in that week, and under
// its Done a "No minyan this week" (the user: "You should also be able to add
// that there's no minyan this week as this week's schedule"). On the listing
// itself only a shul that sends one out each week has an Add button
// (sendsWeekly); No minyan isn't offered there, as it would weigh too much
// beside it (the user, Oct 23).
//
// A week holds only its own dated times (the user, Oct 31: "we keep pulling
// in minyan times from usual to this week and vice versa"). It no longer
// starts from the usual times, as the drawing had it: those stay in their own
// rows, and a week with nothing posted opens empty.
//
// The week is the box's week: Sunday to Shabbos, the next one once Shabbos
// is over (thisWeeksDays). It's one week post (SpecialSchedule, kind
// 'week'), the one the guide already has for the week if there is one,
// else a new one, made once it has a time: opening the row and pressing
// Done changes nothing. It replaces the usual times on each day it has
// times; No minyan is a whole week with none. An admin also gets the week
// after, as a newsletter sent before Shabbos is about next week.

export type EditWeek = { from: string; to: string }

const DAY_MS = 86_400_000
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** Sunday to Shabbos around `today`; the week ahead once Shabbos is over. */
export function editWeek(today: string, shabbosOver: boolean): EditWeek {
  const day = shabbosOver ? shift(today, 1) : today
  const sunday = shift(day, -new Date(`${day}T12:00:00Z`).getUTCDay())
  return { from: sunday, to: shift(sunday, 6) }
}

/** The week after. */
export const weekAfter = (w: EditWeek): EditWeek => ({ from: shift(w.from, 7), to: shift(w.to, 7) })

/** "Oct 25 – Oct 31". */
export const weekDates = (w: EditWeek) => `${dateText(w.from)} – ${dateText(w.to)}`

/** The name a new week goes by, as the guide names the weeks it reads
 *  (listingPageRun's weekName), so the box goes by its dates. */
export const weekTitle = (w: EditWeek) => `Times for ${weekDates(w)}`

/** The week post the row edits: one covering the week, a person's or the
 *  newsletter's before the website's, then the latest-starting, as the box
 *  shows them (firstCovering). */
export function weekPostFor(schedules: readonly SpecialSchedule[], w: EditWeek): SpecialSchedule | null {
  const covering = schedules.filter((s) => s.kind === 'week' && s.from <= w.to && s.to >= w.from)
  return covering.sort((a, b) => Number(a.postedBy === 'website') - Number(b.postedBy === 'website') || b.from.localeCompare(a.from))[0] ?? null
}

/** Whether a week post says there's no minyan that week. */
export const isNoMinyan = (post: SpecialSchedule | null) => !!post?.whole && post.minyanim.length === 0

/** The rows the row's list shows: the post's times dated in the week. */
export function weekRowsFor(post: SpecialSchedule | null, w: EditWeek): Minyan[] {
  return post ? weekPostRows(post, w) : []
}

/** Whether two sets of schedules say something different about the week. */
export function weekDiffers(a: readonly SpecialSchedule[], b: readonly SpecialSchedule[], w: EditWeek): boolean {
  const [was, now] = [weekPostFor(a, w), weekPostFor(b, w)]
  return isNoMinyan(was) !== isNoMinyan(now) || !sameRows(weekRowsFor(was, w), weekRowsFor(now, w))
}

/**
 * The schedules with the week's times set to `rows`. The week the guide
 * has is changed; with none, a new one is added once it has a time. A new
 * one emptied goes again, so nothing is sent.
 */
export function withWeekTimes(
  schedules: readonly SpecialSchedule[],
  stored: readonly SpecialSchedule[],
  w: EditWeek,
  rows: readonly Minyan[],
  { id, now }: { id: string; now: string },
): SpecialSchedule[] {
  const post = weekPostFor(schedules, w)
  const isNew = !!post && !stored.some((s) => s.id === post.id)
  if (isNew && rows.length === 0 && !post.whole) return schedules.filter((s) => s.id !== post.id)
  if (post) return withWeekRows(schedules, post.id, rows, w)
  if (rows.length === 0) return [...schedules]
  return withWeekRows([...schedules, newWeek(w, id, now)], id, rows, w)
}

/** The schedules with the week set to no minyan: the week the guide has,
 *  or a new one. */
export function withNoMinyan(schedules: readonly SpecialSchedule[], w: EditWeek, { id, now }: { id: string; now: string }): SpecialSchedule[] {
  const post = weekPostFor(schedules, w)
  if (!post) return [...schedules, { ...newWeek(w, id, now), whole: true }]
  // One running past the week keeps its other dates; this week goes on its own.
  if (post.from < w.from || post.to > w.to) return [...withWeekRows(schedules, post.id, [], w), { ...newWeek(w, id, now), whole: true }]
  return schedules.map((s) => (s.id === post.id ? { ...s, minyanim: [], whole: true as const } : s))
}

function newWeek(w: EditWeek, id: string, now: string): SpecialSchedule {
  return { id, name: weekTitle(w), from: w.from, to: w.to, mode: 'replace', kind: 'week', postedAt: now, minyanim: [] }
}

// Field by field, ids left out, whatever order.
const plain = (m: Minyan) =>
  JSON.stringify(
    Object.entries(m)
      .filter(([k, v]) => k !== 'id' && v !== undefined && v !== '' && v !== null)
      .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  )
const sameRows = (a: readonly Minyan[], b: readonly Minyan[]) => a.map(plain).sort().join('|') === b.map(plain).sort().join('|')
