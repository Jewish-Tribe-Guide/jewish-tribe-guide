import type { AskResult } from '@/lib/askSearch'
import type { MinyanAsk } from '@/lib/ask'
import { TEFILLAH_LABELS, type Tefillah } from '@/lib/davening'
import type { MinyanSlot } from '@/lib/upcomingDavening'
import { haversineMiles, roundMiles, type LatLng } from '@/lib/geo'

// ── The one-line answer above search results ─────────────────────────────────
// A search that reads a question should answer it, not just list places:
// "ShopRite carries Chalav Yisroel milk", "Next Maariv: 7:15 PM at Mekor
// Habracha", "Nothing open right now". Every word of it comes from the
// listings and their schedules — this module only arranges facts the page
// already has, so it can't state anything the guide doesn't say. When there
// is no clear answer to give, it gives none and the results speak for
// themselves.

export type AnswerRow = {
  /** "7:15 PM" for a minyan. */
  time: string
  /** "Maariv", "Mincha & Maariv". */
  label: string
  shulId?: string
  shulName: string
  miles: number | null
  tomorrow: boolean
}

export type Answer = {
  /** The sentence. */
  text: string
  /** For a minyan question, the minyanim it's about, in time order. */
  rows: AnswerRow[]
}

export type AnswerSchedule = {
  today: MinyanSlot[]
  tomorrow: MinyanSlot[]
  /** Minutes since local midnight, in the community's timezone. */
  nowMinutes: number
}

/** How close to a time someone asked about a minyan has to be to count as
 *  "at" it: nobody asking about 6:45 is turned away by a 6:50. */
const AT_WINDOW = 15

function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** A row's own time text as people read it: "7:00am" → "7:00 AM". */
function displayTime(slot: MinyanSlot): string {
  return formatClock(slot.minutes)
}

function tefillahWords(tefillos: Tefillah[] | null): string {
  if (!tefillos) return 'minyan'
  // Asked for Maariv: the combined Mincha & Maariv is included as an answer,
  // but the question was about Maariv.
  const asked = tefillos.filter((t) => t !== 'mincha_maariv')
  return (asked.length ? asked : tefillos).map((t) => TEFILLAH_LABELS[t]).join(' or ')
}

/** Minutes since midnight for a time someone typed. With no am/pm said, the
 *  tefillah decides (Shacharis is morning; Mincha and Maariv afternoon or
 *  evening), and failing that the next time that clock reading comes round. */
function resolveAt(at: NonNullable<MinyanAsk['at']>, tefillos: Tefillah[] | null, nowMinutes: number): number {
  const base = (at.hour % 12) * 60 + at.minute
  if (at.meridiem === 'am') return base
  if (at.meridiem === 'pm') return base + 12 * 60
  if (tefillos && tefillos.every((t) => t === 'shacharis')) return base
  if (tefillos && tefillos.every((t) => t === 'mincha' || t === 'maariv' || t === 'mincha_maariv')) return base + 12 * 60
  return base >= nowMinutes ? base : base + 12 * 60 >= nowMinutes ? base + 12 * 60 : base
}

function minyanAnswer(
  result: AskResult,
  schedule: AnswerSchedule,
  origin: LatLng | null,
): Answer | null {
  const ask = result.query.minyan!
  // Anything the question said beyond "minyan" narrows the shuls — "an
  // Orthodox shul", "Mekor" — and the search has already found which match.
  const narrowed = result.query.terms.length > 0
  const shulIds = new Set(result.hits.map((h) => h.item.id))
  const within = result.query.within
  const fits = (s: MinyanSlot) =>
    (!ask.tefillos || ask.tefillos.includes(s.tefillah)) &&
    (!narrowed || (s.shulId !== undefined && shulIds.has(s.shulId))) &&
    (!within || !origin || (!!s.shulGeo && haversineMiles(origin, s.shulGeo) <= within.miles))
  const toRow = (s: MinyanSlot, tomorrow: boolean): AnswerRow => ({
    time: displayTime(s),
    label: TEFILLAH_LABELS[s.tefillah],
    shulId: s.shulId,
    shulName: s.shulName,
    miles: origin && s.shulGeo ? roundMiles(haversineMiles(origin, s.shulGeo)) : null,
    tomorrow,
  })
  const today = schedule.today.filter(fits)
  const tomorrow = schedule.tomorrow.filter(fits)
  if (today.length === 0 && tomorrow.length === 0) return null
  const what = tefillahWords(ask.tefillos)
  // "No more minyanim today", but "no more Maariv today".
  const whatAll = ask.tefillos ? what : 'minyanim'
  const where = (r: AnswerRow) => `${r.shulName}${r.miles != null ? ` (${r.miles} mi)` : ''}`

  if (ask.at) {
    const target = resolveAt(ask.at, ask.tefillos, schedule.nowMinutes)
    const near = today.filter((s) => Math.abs(s.minutes - target) <= AT_WINDOW)
    if (near.length) {
      // Named: the one closest to the time asked; the rest are counted.
      const best = toRow([...near].sort((a, b) => Math.abs(a.minutes - target) - Math.abs(b.minutes - target))[0], false)
      const others = near.length - 1
      return {
        text: `Yes: ${best.label} at ${best.time}, ${where(best)}.${others ? ` ${others} more within ${AT_WINDOW} min.` : ''}`,
        rows: near.map((s) => toRow(s, false)),
      }
    }
    const before = today.filter((s) => s.minutes < target).at(-1)
    const after = today.find((s) => s.minutes > target)
    const closest = [before, after].filter((s): s is MinyanSlot => !!s).map((s) => toRow(s, false))
    return {
      text: `No ${what} at ${formatClock(target)} in the guide.${closest.length ? ` Closest: ${closest.map((r) => r.time).join(' and ')}.` : ''}`,
      rows: closest,
    }
  }

  const upcoming = today.filter((s) => s.minutes >= schedule.nowMinutes).map((s) => toRow(s, false))
  if (upcoming.length) {
    const next = upcoming[0]
    const inMin = today.find((s) => s.minutes >= schedule.nowMinutes)!.minutes - schedule.nowMinutes
    const soon = inMin === 0 ? 'now' : inMin < 60 ? `in ${inMin} min` : null
    return {
      text: `Next ${what}: ${next.time}${soon ? ` (${soon})` : ''}, ${where(next)}.${upcoming.length > 1 ? ` ${upcoming.length - 1} more today.` : ''}`,
      rows: upcoming.slice(0, 5),
    }
  }
  const first = tomorrow.map((s) => toRow(s, true))
  return {
    text: first.length ? `No more ${whatAll} today. First tomorrow: ${first[0].time}, ${where(first[0])}.` : `No more ${whatAll} today.`,
    rows: first.slice(0, 3),
  }
}

/** The answer to a search, or null when there's nothing to say beyond the
 *  results themselves. `result` should be unlimited (searchAsk with no
 *  `limit`), so counts ("3 places carry it") are true. */
export function answerFor(
  result: AskResult,
  options: { schedule?: AnswerSchedule | null; coords?: LatLng | null } = {},
): Answer | null {
  const answer = baseAnswer(result, options)
  // "Within a 15-minute drive" needs somewhere to measure from. Without the
  // visitor's location (or a place named in the question) it limited nothing,
  // and saying so beats letting a far place pass as within reach.
  const { within } = result.query
  if (within && !result.anchor && !options.coords) {
    const reach = within.asked ? `about a ${within.asked.minutes}-minute ${within.asked.by}` : `${within.miles} ${within.miles === 1 ? 'mile' : 'miles'}`
    const note = `Set your location to see only places within ${reach}.`
    return answer ? { ...answer, text: `${answer.text} ${note}` } : { text: note, rows: [] }
  }
  return answer
}

function baseAnswer(
  result: AskResult,
  { schedule = null, coords = null }: { schedule?: AnswerSchedule | null; coords?: LatLng | null },
): Answer | null {
  const { query, hits } = result
  if (!query.raw) return null

  if (query.minyan && schedule) {
    const answer = minyanAnswer(result, schedule, result.anchor?.geo ?? coords)
    if (answer) return answer
  }

  if (query.openNow && hits.length === 0 && result.closedCount > 0) {
    const n = result.closedCount
    return { text: `Nothing open right now. ${n} ${n === 1 ? 'place matches, but it is' : 'places match, but all are'} closed.`, rows: [] }
  }

  if (hits.length === 0) return null
  const top = hits[0]
  const milesText = top.miles != null ? `, ${roundMiles(top.miles)} mi` : ''

  // A question about a place ("food near HUP"): the nearest one, measured
  // from there.
  if (result.anchor) {
    const kind = top.category.pluralLabel.toLowerCase()
    return { text: `Closest ${kind} to ${result.anchor.name}: ${top.item.name}${milesText}.`, rows: [] }
  }

  // A question about an item ("cholov yisroel milk"): who has it.
  const item = top.matched[0]
  if (item && query.terms.length > 0) {
    const having = hits.filter((h) => h.matched.some((m) => m.tag === item.tag))
    const sometimes = having.filter((h) => h.matched.find((m) => m.tag === item.tag)?.sometimes).length
    const note = sometimes === having.length ? ' (only sometimes in stock)' : sometimes > 0 ? ` (${sometimes} only sometimes)` : ''
    if (having.length === 1) return { text: `${top.item.name} has ${item.tag}${note}${milesText}.`, rows: [] }
    const nearest = top.miles != null ? ` Nearest: ${top.item.name}${milesText}.` : ''
    return { text: `${having.length} places have ${item.tag}${note}.${nearest}`, rows: [] }
  }

  return null
}
