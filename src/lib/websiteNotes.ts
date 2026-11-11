import { sameTime } from '@/lib/scheduleUpdate'
import type { SpecialSchedule } from '@/lib/schedules'

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
