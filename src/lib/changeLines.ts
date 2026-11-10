import { formatDays, SEASON_LABELS, TEFILLAH_LABELS, type Minyan } from './davening'
import { boxGroups, clockMinutes, noteText, timeText } from './minyanText'
import type { MinyanBox } from './minyanimBox'
import { dateText, datesOf, firstCovering, isOneDayAddition, weekdayOfDate, type SpecialSchedule } from './schedules'

// A change as one list (the user, Oct 31: "drop original vs now"): what stays
// plain, what's new highlighted, what's going crossed out, with the old line
// straight above the one replacing it. Pure, so the moderator's view can't
// disagree with itself; ChangeReview draws it.

export type ChangeLine = {
  key: string
  text: string
  sub?: string
  kind: 'same' | 'new' | 'gone'
  /** Only its note, join link, sign-up or season changes (the user, Nov
   *  10: "don't even say the davening time is new. Make it clear that the
   *  suggestion is only on the note"): the line stays plain, and this says
   *  what changes, with the old words. */
  extras?: { says: string; was?: string; now?: string }
}
export type ChangeGroup = { label: string; lines: ChangeLine[] }

// What a person would read, field by field: ids and the dates it's on left out.
const said = (m: object) =>
  JSON.stringify(
    Object.entries(m)
      .filter(([k, v]) => k !== 'id' && k !== 'on' && v !== undefined && v !== '' && v !== null)
      .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  )

const titled = (m: Pick<Minyan, 'tefillah' | 'time' | 'anchor' | 'offsetMinutes' | 'notBefore' | 'notAfter'>) => `${TEFILLAH_LABELS[m.tefillah]} ${timeText(m)}`

const extras = (m: Pick<Minyan, 'season' | 'signUp' | 'joinLink' | 'notes'>) => [m.season ? SEASON_LABELS[m.season] : null, m.signUp ? 'Sign-up' : null, m.joinLink ? 'Online' : null, noteText(m.notes)]

const subOf = (parts: (string | null)[]) => parts.filter(Boolean).join(' · ') || undefined

const EXTRA_NAMES = ['season', 'sign-up', 'join link', 'note'] as const
const extraWords = (m: Pick<Minyan, 'season' | 'signUp' | 'joinLink' | 'notes'>) => [m.season ?? null, m.signUp ? JSON.stringify(m.signUp) : null, m.joinLink?.trim() || null, noteText(m.notes)]

/** What changes between two of the same minyan when it's only its extras:
 *  "Note changed", "Join link added". Null when anything else differs. */
function extrasOnly(w: Minyan | ScheduleRow, m: Minyan | ScheduleRow, sameElse: boolean): ChangeLine['extras'] | null {
  if (!sameElse || titled(w) !== titled(m)) return null
  const a = extraWords(w)
  const b = extraWords(m)
  const what = EXTRA_NAMES.flatMap((name, i) => (a[i] === b[i] ? [] : [`${name} ${!a[i] ? 'added' : !b[i] ? 'taken off' : 'changed'}`])).join(', ')
  if (!what) return null
  const was = subOf(extras(w).filter((x, i) => x !== extras(m)[i]))
  const now = subOf(extras(m).filter((x, i) => x !== extras(w)[i]))
  return { says: what[0].toUpperCase() + what.slice(1), ...(was ? { was } : {}), ...(now ? { now } : {}) }
}
type ScheduleRow = SpecialSchedule['minyanim'][number]

/** A usual-times box, its rows under the headings the listing has. */
export function usualBoxChange(was: readonly Minyan[], now: readonly Minyan[], box: MinyanBox): ChangeGroup[] {
  const line = (m: Minyan, kind: ChangeLine['kind']): ChangeLine => ({ key: `${kind}:${m.id}`, text: titled(m), sub: subOf([formatDays(m.days), ...extras(m)]), kind })
  // The same words are the same row, whatever its id; then by id, a changed one.
  const left = [...was]
  const take = (test: (w: Minyan) => boolean) => {
    const i = left.findIndex(test)
    return i < 0 ? undefined : left.splice(i, 1)[0]
  }
  const same = new Set(now.filter((m) => take((w) => said(w) === said(m))))
  const replaced = new Map(now.filter((m) => !same.has(m)).flatMap((m) => {
    const w = take((x) => x.id === m.id)
    return w ? [[m, w] as const] : []
  }))
  return boxGroups([...now, ...left], box).map((g) => ({
    label: g.label,
    lines: g.rows.flatMap((m) => {
      if (left.includes(m)) return [line(m, 'gone')]
      if (same.has(m)) return [line(m, 'same')]
      const w = replaced.get(m)
      const only = w && extrasOnly(w, m, formatDays(w.days) === formatDays(m.days))
      if (only) return [{ ...line(m, 'same'), key: `extras:${m.id}`, extras: only }]
      return w ? [line(w, 'gone'), line(m, 'new')] : [line(m, 'new')]
    }),
  }))
}

/** What the site has on a date, as the listing picks it: the post that has
 *  the date, then that day's one-day additions. */
function heldOn(schedules: readonly SpecialSchedule[], date: string) {
  const covers = schedules.filter((s) => s.from <= date && date <= s.to)
  const post = firstCovering(covers.filter((s) => !isOneDayAddition(s)))
  const weekday = weekdayOfDate(date)
  return [...(post ? [post] : []), ...covers.filter(isOneDayAddition)].flatMap((s) => s.minyanim.filter((m) => m.on.some((on) => on === date || on === weekday || on === 'yom_tov' || on === 'chol_hamoed')))
}

/**
 * The dates a schedule change reaches, each a heading with its times: only
 * the days that differ, in date order. Empty when no date's times differ (a
 * new post's name, a week with nothing set to no minyan): the caller says so
 * another way.
 */
export function scheduleChange(before: readonly SpecialSchedule[], after: readonly SpecialSchedule[]): ChangeGroup[] {
  const was = new Map(before.map((s) => [s.id, JSON.stringify(s)]))
  const now = new Map(after.map((s) => [s.id, JSON.stringify(s)]))
  const moved = [...before.filter((s) => now.get(s.id) !== was.get(s.id)), ...after.filter((s) => now.get(s.id) !== was.get(s.id))]
  const dates = [...new Set(moved.flatMap(datesOf))].sort()
  return dates.flatMap((date) => {
    const left = [...heldOn(before, date)]
    const nowRows = heldOn(after, date)
    const kept = nowRows.map((m) => {
      const i = left.findIndex((w) => said(w) === said(m))
      if (i >= 0) left.splice(i, 1)
      return i >= 0
    })
    if (left.length === 0 && kept.every(Boolean)) return []
    const line = (m: (typeof nowRows)[number], kind: ChangeLine['kind']): ChangeLine => ({ key: `${kind}:${m.id}`, text: titled(m), sub: subOf(extras(m)), kind })
    const at = (m: (typeof nowRows)[number]) => clockMinutes(m.time) ?? 24 * 60
    // The same minyan at the same time with another note is that minyan,
    // its note changed: one line, not the old crossed out and a new one.
    const notes = new Map<(typeof nowRows)[number], ChangeLine>()
    nowRows.forEach((m, i) => {
      if (kept[i]) return
      const j = left.findIndex((w) => extrasOnly(w, m, true))
      if (j < 0) return
      const w = left.splice(j, 1)[0]
      notes.set(m, { ...line(m, 'same'), key: `extras:${m.id}`, extras: extrasOnly(w, m, true)! })
    })
    const rows = [...left.map((m) => ({ m, kind: 'gone' as const })), ...nowRows.map((m, i) => ({ m, kind: kept[i] ? ('same' as const) : ('new' as const) }))]
    // By time; the old line above a new one at the same time.
    rows.sort((a, b) => at(a.m) - at(b.m) || Number(a.kind !== 'gone') - Number(b.kind !== 'gone'))
    return [{ label: dateText(date, { weekday: true }), lines: rows.map((r) => notes.get(r.m) ?? line(r.m, r.kind)) }]
  })
}

/** Whether all a change does is change notes (and join links, sign-ups,
 *  seasons): the moderator is told it's those, not the times. */
export const onlyExtras = (groups: readonly ChangeGroup[]) => {
  const moved = groups.flatMap((g) => g.lines).filter((l) => l.kind !== 'same' || l.extras)
  return moved.length > 0 && moved.every((l) => l.extras)
}
