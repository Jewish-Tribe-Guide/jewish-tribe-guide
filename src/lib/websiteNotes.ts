import { datesBetween, sameTime } from '@/lib/scheduleUpdate'
import type { ScheduleMinyan, SpecialSchedule } from '@/lib/schedules'

// ── A re-read's notes that say nothing new ────────────────────────────────────
// The watch reads a shul's week again twice a week, and the AI words a
// minyan's note a little differently each time: "until 8:00 AM; coffee and
// learning" one day, "until 8:00 AM" the next, "seudah shlishit" then "and
// seudah shlishit". Filed, that is a change in the queue the same as what's
// on the site (the user, Nov 11, on South Philadelphia Shtiebel). A note
// that only drops or rewords words the listing's note already has keeps
// the listing's note; one with a word it doesn't have ("no learning",
// "cancelled") still goes to the queue.

/** Words that join a note's parts, not what it says. */
const FILLER = new Set(['and', 'the', 'a', 'an', 'with', 'of', 'then', 'followed', 'by', 'plus', 'at'])

const words = (note: string | undefined) =>
  (note ?? '')
    .toLowerCase()
    .split(/[^a-z0-9:']+/)
    .filter((w) => w && !FILLER.has(w))

/** Whether `now` says nothing `was` doesn't: every word of it is there. */
export function addsNothing(was: string | undefined, now: string | undefined): boolean {
  if (!was?.trim() || (now ?? '') === was) return false
  const had = new Set(words(was))
  return words(now).every((w) => had.has(w))
}

/** The website's weeks after a read (`after`), each minyan the listing's
 *  week already has on that date, tefillah and time keeping the listing's
 *  note when the new one adds nothing (addsNothing). */
export function keepListedNotes(before: readonly SpecialSchedule[], after: readonly SpecialSchedule[]): SpecialSchedule[] {
  const listed = before.filter((s) => s.kind === 'week' && s.postedBy === 'website')
  return after.map((s) => {
    if (s.kind !== 'week' || s.postedBy !== 'website') return s
    let kept = false
    const minyanim = s.minyanim.map((m) => {
      const was = listed
        .flatMap((l) => l.minyanim)
        .find((x) => x.tefillah === m.tefillah && x.on.length === m.on.length && x.on.every((d) => m.on.includes(d)) && sameTime(x, m))
      if (!was || !addsNothing(was.notes, m.notes)) return m
      kept = true
      return { ...m, notes: was.notes }
    })
    return kept ? { ...s, minyanim } : s
  })
}

// ── What the admin already turned down ────────────────────────────────────────
// A read week is filed whole, so a line the admin rejected came back the
// next time anything else in that week changed: Kol Tzedek's Bar Mitzvah
// note three times, TBZBI's Zoom links twice, Rodeph Shalom's Thursday
// note twice (prod queue, Nov 12). Each day's tefillah is weighed on its
// own: one the page gives just as a suggestion the admin turned down gave
// it, with no approval for that day since, stays as the listing has it.
// The page giving that day something else again still goes to the queue.

/** An approved or turned-down suggestion of this watch's: its website
 *  weeks, and when the admin decided. */
export type Decision = { turnedDown: boolean; at: string; weeks: readonly SpecialSchedule[] }

const websiteWeek = (s: SpecialSchedule) => s.kind === 'week' && s.postedBy === 'website'

/** A minyan as the queue would show it, whatever its id and dates. */
function look(m: ScheduleMinyan): string {
  return JSON.stringify(
    Object.entries(m)
      .filter(([k, v]) => k !== 'id' && k !== 'on' && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

/** What a day gives for one tefillah, in any order. */
const slot = (minyanim: readonly ScheduleMinyan[], day: string, tefillah: string) =>
  minyanim
    .filter((m) => m.tefillah === tefillah && m.on.includes(day))
    .map(look)
    .sort()
    .join('\n')

const covers = (weeks: readonly SpecialSchedule[], day: string) => weeks.some((w) => w.from <= day && w.to >= day)

/** The website's weeks after a read (`after`), with each day's tefillah the
 *  admin already turned down (`decisions`) put back as the listing has it.
 *  The same array when nothing was. */
export function leaveOutTurnedDown(before: readonly SpecialSchedule[], after: SpecialSchedule[], decisions: readonly Decision[]): SpecialSchedule[] {
  if (!decisions.some((d) => d.turnedDown)) return after
  const listedWeeks = before.filter(websiteWeek)
  const listed = listedWeeks.flatMap((s) => s.minyanim)
  const turnedDown = (day: string, tefillah: string, read: string) => {
    const approved = decisions.filter((d) => !d.turnedDown && covers(d.weeks, day)).reduce((a, d) => (d.at > a ? d.at : a), '')
    return decisions.some((d) => d.turnedDown && d.at > approved && covers(d.weeks, day) && slot(d.weeks.flatMap((w) => w.minyanim), day, tefillah) === read)
  }
  let any = false
  const out = after.flatMap((s) => {
    if (!websiteWeek(s)) return [s]
    const days = datesBetween(s.from, s.to)
    const back = new Set<string>()
    for (const day of days) {
      const tefillos = new Set([...s.minyanim, ...listed].filter((m) => m.on.includes(day)).map((m) => m.tefillah))
      for (const t of tefillos) {
        const read = slot(s.minyanim, day, t)
        if (read !== slot(listed, day, t) && turnedDown(day, t, read)) back.add(`${day}|${t}`)
      }
    }
    if (!back.size) return [s]
    any = true
    const isBack = (m: ScheduleMinyan, day: string) => back.has(`${day}|${m.tefillah}`)
    const minyanim = s.minyanim.flatMap((m) => {
      const on = m.on.filter((d) => !isBack(m, d))
      return on.length === m.on.length ? [m] : on.length ? [{ ...m, on }] : []
    })
    for (const m of listed) {
      const on = m.on.filter((d) => days.includes(d) && isBack(m, d))
      if (!on.length) continue
      const same = minyanim.findIndex((x) => x.id === m.id)
      if (same < 0) minyanim.push({ ...m, on })
      else if (look(minyanim[same]) === look(m)) minyanim[same] = { ...minyanim[same], on: [...new Set([...minyanim[same].on, ...on])].sort() }
      else minyanim.push({ ...m, id: `${m.id}-${on[0]}`, on })
    }
    // Back to just what the listing has: the listing's own copy of the week.
    const was = listedWeeks.find((w) => w.id === s.id)
    const tefillos = (day: string) => new Set([...minyanim, ...listed].filter((m) => m.on.includes(day)).map((m) => m.tefillah))
    if (was && days.every((d) => [...tefillos(d)].every((t) => slot(minyanim, d, t) === slot(listed, d, t)))) return [was]
    if (!minyanim.length && !was) return []
    return [{ ...s, minyanim }]
  })
  return any ? out : after
}
