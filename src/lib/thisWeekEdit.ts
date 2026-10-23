import { DAY_KEYS, type DayKey } from './hours'
import type { Minyan } from './davening'
import type { Season } from './season'
import { outOfSeason } from './seasonPairs'
import { dateText, weekPostRows, withWeekRows, type SpecialSchedule } from './schedules'
import type { AnchorTimes } from './useZmanAnchors'

// ── This week's schedule, added in Edit listing (agreed Oct 23) ─────────────
// Drawing SwWk3BLEYTtVu2k3w2UJ5s v3. Any shul's Edit listing has a "This
// week's schedule" row: the week's times, starting from the shul's usual
// ones, and under its Done a "No minyan this week" (the user: "You should
// also be able to add that there's no minyan this week as this week's
// schedule"). On the listing itself only a shul that sends one out each
// week has an Add button (sendsWeekly); No minyan isn't offered there, as
// it would weigh too much beside it (the user, Oct 23).
//
// The week is the box's week: Sunday to Shabbos, the next one once Shabbos
// is over (thisWeeksDays). It's one week post (SpecialSchedule, kind
// 'week'), the one the guide already has for the week if there is one,
// else a new one, made only once its times differ from where they started:
// opening the row and pressing Done changes nothing. It replaces the usual
// times on each day it has times; No minyan is a whole week with none.

export type EditWeek = { from: string; to: string }

const DAY_MS = 86_400_000
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** Sunday to Shabbos around `today`; the week ahead once Shabbos is over. */
export function editWeek(today: string, shabbosOver: boolean): EditWeek {
  const day = shabbosOver ? shift(today, 1) : today
  const sunday = shift(day, -new Date(`${day}T12:00:00Z`).getUTCDay())
  return { from: sunday, to: shift(sunday, 6) }
}

/** "Oct 25 – Oct 31". */
export const weekDates = (w: EditWeek) => `${dateText(w.from)} – ${dateText(w.to)}`

/** The name a new week goes by, as the guide names the weeks it reads
 *  (listingPageRun's weekName), so the box goes by its dates. */
export const weekTitle = (w: EditWeek) => `Times for ${weekDates(w)}`

/** The week post the row edits: one covering the week, a person's or the
 *  newsletter's before the website's, as the box shows them. */
export function weekPostFor(schedules: readonly SpecialSchedule[], w: EditWeek): SpecialSchedule | null {
  const covering = schedules.filter((s) => s.kind === 'week' && s.from <= w.to && s.to >= w.from)
  return covering.sort((a, b) => Number(a.postedBy === 'website') - Number(b.postedBy === 'website') || a.from.localeCompare(b.from))[0] ?? null
}

/** Whether a week post says there's no minyan that week. */
export const isNoMinyan = (post: SpecialSchedule | null) => !!post?.whole && post.minyanim.length === 0

/** The usual times a new week starts from: this season's (its summer/winter
 *  pair deciding, seasonPairs.ts), on the days of the week. A row's Rosh
 *  Chodesh or holiday days aren't dates in the week, so they're left off,
 *  and so is its note, which is about the usual times ("Meets the first
 *  weekend of every month"), not this week's (the user, Oct 23). */
export function usualWeekRows(regular: readonly Minyan[], season: Season | null, anchors?: AnchorTimes): Minyan[] {
  return regular.flatMap((m) => {
    if (outOfSeason(m, regular, season, anchors)) return []
    const days = m.days.filter((d): d is DayKey => (DAY_KEYS as readonly string[]).includes(d))
    if (days.length === 0) return []
    const { season: _season, notes: _notes, ...rest } = m
    void _season
    void _notes
    return [{ ...rest, days }]
  })
}

/** The rows the row's list shows: the week's own, else the usual ones. */
export function weekRowsFor(post: SpecialSchedule | null, usual: readonly Minyan[]): Minyan[] {
  return post ? weekPostRows(post) : [...usual]
}

/**
 * The schedules with the week's times set to `rows`. The week the guide
 * has is changed; with none, a new one is added, unless `rows` are just
 * where it started (`usual`). A new one put back to the usual times goes
 * again, so nothing is sent.
 */
export function withWeekTimes(
  schedules: readonly SpecialSchedule[],
  stored: readonly SpecialSchedule[],
  w: EditWeek,
  rows: readonly Minyan[],
  { usual, id, now }: { usual: readonly Minyan[]; id: string; now: string },
): SpecialSchedule[] {
  const post = weekPostFor(schedules, w)
  const isNew = !!post && !stored.some((s) => s.id === post.id)
  const asUsual = sameRows(rows, usual)
  if (isNew && asUsual && !post.whole) return schedules.filter((s) => s.id !== post.id)
  if (post) return withWeekRows(schedules, post.id, rows)
  if (asUsual) return [...schedules]
  return withWeekRows([...schedules, newWeek(w, id, now)], id, rows)
}

/** The schedules with the week set to no minyan: the week the guide has,
 *  or a new one. */
export function withNoMinyan(schedules: readonly SpecialSchedule[], w: EditWeek, { id, now }: { id: string; now: string }): SpecialSchedule[] {
  const post = weekPostFor(schedules, w)
  if (!post) return [...schedules, { ...newWeek(w, id, now), whole: true }]
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
