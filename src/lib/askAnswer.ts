import { describedByItsText, type AskHit, type AskResult, type HoursWindow } from '@/lib/askSearch'
import { termMatches, termsAsTyped, words, type MinyanAsk } from '@/lib/ask'
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
  /** For a minyan question, the minyanim it's about, in time order: all of
   *  them, so "9 more today" can be opened up rather than just counted. */
  rows: AnswerRow[]
  /** How many of `rows` to show before a "Show all" — the answer is a
   *  glance, the full list is a tap away. Absent means show every row. */
  shown?: number
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
  // Two minyanim at the same time: the nearer shul first, since the first
  // is the one the sentence names. The schedule breaks ties by name, which
  // named the farther of two 9:00 Shacharises.
  const away = (s: MinyanSlot) => (origin && s.shulGeo ? haversineMiles(origin, s.shulGeo) : Infinity)
  const byTime = (a: MinyanSlot, b: MinyanSlot) => a.minutes - b.minutes || away(a) - away(b)
  const today = schedule.today.filter(fits).sort(byTime)
  const tomorrow = schedule.tomorrow.filter(fits).sort(byTime)
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
      rows: upcoming,
      shown: 5,
    }
  }
  const first = tomorrow.map((s) => toRow(s, true))
  return {
    text: first.length ? `No more ${whatAll} today. First tomorrow: ${first[0].time}, ${where(first[0])}.` : `No more ${whatAll} today.`,
    rows: first,
    shown: 3,
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

  const asksOpen = query.openNow || query.openToday
  const later = query.openNow ? 'right now' : 'for the rest of today'
  const { closedCount: closed, noHours } = result
  const noHoursNote = (more: boolean) =>
    noHours.length ? ` ${noHours.length}${more ? ' more' : ''} ${noHours.length === 1 ? 'has' : 'have'} no hours listed.` : ''

  if (asksOpen && hits.length === 0 && (closed > 0 || noHours.length > 0)) {
    // Saying "closed" of a place with no hours saved would be the guide
    // making it up; it says it doesn't know instead.
    if (!noHours.length) {
      return { text: `Nothing open ${later}. ${closed} ${closed === 1 ? 'place matches, but it is' : 'places match, but all are'} closed.`, rows: [] }
    }
    const closedNote = closed ? ` ${closed} ${closed === 1 ? 'is' : 'are'} closed.` : ''
    return { text: `Nothing listed as open ${later}.${noHoursNote(false)}${closedNote}`, rows: [] }
  }

  if (hits.length === 0) return null
  const top = hits[0]
  const milesOf = (h: AskHit) => (h.miles != null ? `, ${roundMiles(h.miles)} mi` : '')
  const hoursOf = (h: AskHit) => (asksOpen && h.today.length ? `, ${hoursText(h, query.openNow)}` : '')

  // A question about a place ("food near HUP"): the nearest one, measured
  // from there.
  if (result.anchor) {
    const kind = top.category.pluralLabel.toLowerCase()
    return { text: `Closest ${kind} to ${result.anchor.name}: ${top.item.name}${milesOf(top)}.`, rows: [] }
  }

  // A question about an item ("cholov yisroel milk"): who has it. Every
  // place with a matching item counts, however it words it: the nine stores
  // with cheese list "Sliced Cheeses", "Goat Cheese", "Cheese Sticks"…, and
  // counting only one wording said a single store had cheese. A place with
  // no item list counts by its own description: asked for pretzels, the
  // pretzel bakery has them as surely as the store with pretzel buns. But
  // only as good a match as the best: for "sliced goat cheese", a store with
  // plain "Goat Cheese" doesn't have it. The word still being typed doesn't
  // count…
  const typed = query.terms.filter((t) => t !== query.partial)
  let asked = typed
  const covers = (h: AskHit) =>
    Math.max(
      h.matched.length ? coverage(h.matched[0].tag, asked) : 0,
      ...h.matchedFields.filter((f) => f.describes).map((f) => coverage(f.text, asked)),
      // …and by its name, which says what it serves: Espresso Cafe & Sushi
      // Bar. Unless the question was the name itself, looking the place up.
      describedByItsText(h.category) && coverage(h.item.name, asked) < words(h.item.name).length ? coverage(h.item.name, asked) : 0,
    )
  let best = Math.max(0, ...hits.map(covers))
  // …unless it's the item itself: "giant wine", before the space.
  if (best === 0 && typed.length < query.terms.length) {
    asked = query.terms
    best = Math.max(0, ...hits.map(covers))
  }
  // Every word asked is in the top result's name: that's looking the place
  // up ("20th street pizza"), not asking who has something.
  const namesTop = coverage(top.item.name, query.terms) === query.terms.length
  const having = best > 0 && !namesTop ? hits.filter((h) => covers(h) === best) : []
  if (having.length) {
    const thing = itemName(having, query.raw, asked)
    const sometimes = having.filter((h) => h.matched.length > 0 && h.matched.every((m) => m.sometimes)).length
    const note = sometimes === having.length ? ' (only sometimes in stock)' : sometimes > 0 ? ` (${sometimes} only sometimes)` : ''
    const near = nearest(having)
    const closedNote = asksOpen && closed ? ` ${closed} more ${closed === 1 ? 'is' : 'are'} closed ${later}.` : ''
    if (having.length === 1) return { text: `${near.item.name} has ${thing}${note}${milesOf(near)}${hoursOf(near)}.${closedNote}`, rows: [] }
    const nearText = near.miles != null ? ` Nearest: ${near.item.name}${milesOf(near)}${hoursOf(near)}.` : ''
    const open = query.openNow ? ' open' : query.openToday ? ' open today' : ''
    return { text: `${having.length}${open} places have ${thing}${note}.${nearText}${closedNote}`, rows: [] }
  }

  // Asked only what's open ("is there a mikvah open today"): what is, and
  // which of its hours — a mikvah's men's hours are not its women's.
  if (asksOpen) {
    const near = nearest(hits)
    if (hits.length === 1) return { text: `${near.item.name}: ${hoursText(near, query.openNow)}${milesOf(near)}.${noHoursNote(true)}`, rows: [] }
    const kinds = new Set(hits.map((h) => h.category.id))
    const kind = kinds.size === 1 ? top.category.pluralLabel.toLowerCase() : 'places'
    return {
      text: `${hits.length} ${kind} open ${query.openNow ? 'now' : 'today'}. Nearest: ${near.item.name}, ${hoursText(near, query.openNow)}${milesOf(near)}.${noHoursNote(true)}`,
      rows: [],
    }
  }

  return null
}

/** The nearest of some hits, or the best match when there's no distance. */
function nearest(hits: AskHit[]): AskHit {
  return hits.reduce((best, h) => (h.miles != null && (best.miles == null || h.miles < best.miles) ? h : best), hits[0])
}

/** What to call the item asked about: the listings' own word for it when
 *  they agree ("Chalav Yisroel Milk"), the asker's when they don't. */
function itemName(having: AskHit[], raw: string, terms: string[]): string {
  const tops = new Set(having.map((h) => h.matched[0]?.tag ?? ''))
  if (tops.size === 1 && !tops.has('')) return [...tops][0]
  tops.delete('')
  const typed = termsAsTyped(raw, terms)
  if (typed) return typed
  // Nothing typed survived as a term (an abbreviation, say): the shortest.
  return [...tops].sort((a, b) => a.length - b.length)[0] ?? raw
}

/** How many of the words asked an item has. */
function coverage(tag: string, terms: string[]): number {
  const tagWords = words(tag)
  return terms.filter((t) => termMatches(t, tagWords)).length
}

/** "Men's open until 10:00 AM", "Women's opens 8:00 PM", "open until 9:00 PM":
 *  a place's hours for the rest of today, each named. For "open now", only
 *  what's open now. */
function hoursText(hit: AskHit, nowOnly: boolean): string {
  const windows = nowOnly ? hit.today.filter((w) => w.openNow) : hit.today
  return windows.map(windowText).join(', ')
}

function windowText(w: HoursWindow): string {
  const when = w.openNow ? `open until ${w.closes}` : `opens ${w.opens}`
  return w.label ? `${w.label} ${when}` : when
}

/** For a result of an "open now" or "open today" question: the line that
 *  says why it's there — "Open until 9:00 PM", "Women's opens 8:00 PM" — or
 *  that it has no hours listed. Null for any other question. */
export function hitHoursNote(hit: AskHit, query: AskResult['query']): { text: string; known: boolean } | null {
  if (!query.openNow && !query.openToday) return null
  if (hit.open === null) return { text: 'No hours listed', known: false }
  const text = hoursText(hit, query.openNow)
  if (!text) return null
  return { text: text[0].toUpperCase() + text.slice(1), known: true }
}
