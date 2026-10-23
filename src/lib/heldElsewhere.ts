import { TEFILLAH_LABELS } from './davening'
import { minutesOn, weekdayOf, type DayZmanim, type ReadRegularTime } from './scheduleUpdate'
import { readSchedules, regularMinyanim, sameCrowd, schedulesKey } from './schedules'

// ── A minyan a shul's message says is held somewhere else ───────────────────
// Mekor's newsletter lists "2:00pm Mincha at 1818 Market or Mikveh Israel":
// Mikveh Israel's own Mincha, which its website already gives the guide,
// filed every week as Mekor's and taken off by hand (the user, Oct 23). But
// a shul can have a minyan of its own somewhere else, so "held elsewhere"
// alone drops nothing (the user: "a shul definitely could have mincha at a
// second location"). It's left out only when the place it names is another
// shul in the guide that already has that minyan: the same tefillah, that
// day, at about that time. Anything else stays, with where it's held in its
// note. Plain code over the listings the caller already has: no model call.

/** "About that time": a shul's "2:00" and another's "2:10" for the same
 *  crowd are one minyan; half an hour apart, they're two. */
export const SAME_MINYAN_MINUTES = 15

type Place = { id: string; name: string }

const plain = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** A shul's name as a message would say it: "Kahal Kadosh Mikveh Israel"
 *  is "Mikveh Israel", "Society Hill Synagogue" is "Society Hill". */
function calledBy(name: string): string[] {
  const full = plain(name)
  const short = full
    .replace(/^(?:(?:the|congregation|kahal kadosh|kehillat|kehilat|temple)\s+)+/, '')
    .replace(/\s+(?:synagogue|shul)$/, '')
  return [...new Set([full, short])].filter((n) => n.length >= 4)
}

/** The place in the guide `where` names, other than the shul itself. */
export function placeNamed<P extends Place>(where: string, shulId: string, places: readonly P[]): P | null {
  const said = ` ${plain(where)} `
  return places.find((p) => p.id !== shulId && calledBy(p.name).some((n) => said.includes(` ${n} `))) ?? null
}

function close(a: ReadRegularTime, b: { time: string; anchor?: ReadRegularTime['anchor']; offsetMinutes?: number; notBefore?: string; notAfter?: string }, zm?: DayZmanim): boolean {
  if (a.anchor && b.anchor && a.anchor === b.anchor) return Math.abs((a.offsetMinutes ?? 0) - (b.offsetMinutes ?? 0)) <= SAME_MINYAN_MINUTES
  const x = minutesOn(a, zm)
  const y = minutesOn(b, zm)
  return x !== null && y !== null && Math.abs(x - y) <= SAME_MINYAN_MINUTES
}

/** Whether the place already has this minyan: its usual times on that
 *  weekday, and on a date, any of its schedules' times that day. */
export function hasMinyan(place: Place, key: string, t: ReadRegularTime, zmanim: Record<string, DayZmanim> = {}): boolean {
  const fields = place as unknown as Record<string, unknown>
  const regular = regularMinyanim(fields[key])
  if (t.date) {
    const weekday = weekdayOf(t.date)
    const that = [...regular.filter((m) => m.days.includes(weekday)), ...readSchedules(fields[schedulesKey(key)]).flatMap((s) => s.minyanim.filter((m) => m.on.includes(t.date!)))]
    return that.some((m) => sameCrowd(t.tefillah, m.tefillah) && close(t, m, zmanim[t.date!]))
  }
  return regular.some((m) => sameCrowd(t.tefillah, m.tefillah) && t.days.some((d) => m.days.includes(d)) && close(t, m))
}

/** "at 1818 Market", added to its note unless the note already says. */
function withWhere(t: ReadRegularTime): ReadRegularTime {
  const where = t.where!
  if (t.notes && plain(t.notes).includes(plain(where))) return t
  return { ...t, notes: [t.notes, `at ${where}`].filter(Boolean).join(', ') }
}

/**
 * The times read, without those another shul in the guide already has
 * (`left`, one line each for the admin). `others`: the guide's listings,
 * asked for only when a time was read as held somewhere else; without
 * them, nothing is left out.
 */
export async function leaveOutHeldElsewhere<P extends Place>(
  times: readonly ReadRegularTime[],
  { shulId, key, zmanim, others }: { shulId: string; key: string; zmanim?: Record<string, DayZmanim>; others?: () => Promise<readonly P[]> },
): Promise<{ times: ReadRegularTime[]; left: string[] }> {
  if (!times.some((t) => t.where)) return { times: [...times], left: [] }
  const places = others ? await others() : []
  const kept: ReadRegularTime[] = []
  const left = new Set<string>()
  for (const t of times) {
    if (!t.where) {
      kept.push(t)
      continue
    }
    const place = placeNamed(t.where, shulId, places)
    if (place && hasMinyan(place, key, t, zmanim)) left.add(`Left out: ${TEFILLAH_LABELS[t.tefillah]} ${t.time}, already on ${place.name}`)
    else kept.push(withWhere(t))
  }
  return { times: kept, left: [...left] }
}
