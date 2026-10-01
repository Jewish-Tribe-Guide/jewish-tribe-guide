import type { DirectoryResource, EruvRecord, ZmanimData } from '@/types'
import type { CategoryConfig } from '@/lib/categories'
import { resolvePrimaryZmanimBlock } from '@/lib/zmanim'
import { describedByItsText, type AskHit, type DayWindow, type AskResult, type HoursWindow, type NearMiss } from '@/lib/askSearch'
import { formatOpenAtTime, termMatches, termsAsTyped, words, type MetaAsk, type MinyanAsk, type MinyanWhen, type TimesAsk } from '@/lib/ask'
import { TEFILLAH_LABELS, type Tefillah } from '@/lib/davening'
import type { MinyanSlot } from '@/lib/upcomingDavening'
import { haversineMiles, milesText, roundMiles, type LatLng } from '@/lib/geo'
import type { DayKey } from '@/lib/hours'

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
  /** Which day, when an answer covers more than one ("Friday night" and
   *  "Shabbos" for "Shabbos minyanim"). */
  day?: string
}

export type Answer = {
  /** The sentence. */
  text: string
  /** For a minyan question, the minyanim it's about, in time order: all of
   *  them, so "9 more today" can be opened up rather than just counted. */
  rows: AnswerRow[]
  /** Where to go for what the guide itself can't say: each eruv's own
   *  status page, the page about something. Shown under the sentence. */
  links?: AnswerLink[]
  /** Set when this isn't an answer to what was asked but to the closest
   *  question that has one (see nearMissAnswer): the page shows it, and the
   *  places under it, as close rather than as found. */
  closest?: boolean
  /** How many of `rows` to show before a "Show all" — the answer is a
   *  glance, the full list is a tap away. Absent means show every row. */
  shown?: number
  /** The day the rows are for, when the question named one: "Show all 8"
   *  then says nothing of today or tomorrow. */
  when?: string
}

export type AnswerLink = {
  label: string
  /** "Penn, Drexel & West Philadelphia": what it covers. */
  detail?: string
  href: string
  /** Another site, opened in a new tab. */
  external: boolean
}

export type AnswerSchedule = {
  today: MinyanSlot[]
  tomorrow: MinyanSlot[]
  /** Minutes since local midnight, in the community's timezone. */
  nowMinutes: number
  /** For a question about a day ("Shacharis Sunday"): which days today and
   *  tomorrow are, and any day's minyanim. Without them only the next ones
   *  from now can be answered. */
  todayKey?: DayKey
  tomorrowKey?: DayKey
  onDay?: (day: DayKey) => MinyanSlot[]
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
  center: LatLng | null = null,
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
  // named the farther of two 9:00 Shacharises. With no location, nearer the
  // community's centre: by name, "next minyan" named a Cherry Hill shul
  // 8.2 mi out over Mekor Habracha at the same 6:20 (Sep 28).
  const from = origin ?? center
  const away = (s: MinyanSlot) => (from && s.shulGeo ? haversineMiles(from, s.shulGeo) : Infinity)
  const byTime = (a: MinyanSlot, b: MinyanSlot) => a.minutes - b.minutes || away(a) - away(b)
  const where = (r: AnswerRow) => `${r.shulName}${r.miles != null ? ` (${r.miles} mi)` : ''}`
  if (ask.when) return minyanDaysAnswer(ask, ask.when, schedule, fits, toRow, byTime, where, !!origin)
  const today = schedule.today.filter(fits).sort(byTime)
  const tomorrow = schedule.tomorrow.filter(fits).sort(byTime)
  if (today.length === 0 && tomorrow.length === 0) return null
  const what = tefillahWords(ask.tefillos)
  // "No more minyanim today", but "no more Maariv today".
  const whatAll = ask.tefillos ? what : 'minyanim'

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

/** A minyan question about a day or days ("Shacharis tomorrow", "Friday
 *  night minyan", "Shabbos"): that day's minyanim, of the tefillos asked
 *  or that part of the day means, first named and the rest counted. A
 *  weekday that's today is all of today's, earlier ones too. Nothing listed
 *  is said as nothing listed in the guide, never as nothing happening.
 *  A time set by sunset on a day after tomorrow is worked out from today's
 *  sunset, so it's marked "~" and the answer says it may be a minute or two
 *  off, rather than stating a time the guide doesn't have. */
function minyanDaysAnswer(
  ask: MinyanAsk,
  when: MinyanWhen[],
  schedule: AnswerSchedule,
  fits: (s: MinyanSlot) => boolean,
  toRow: (s: MinyanSlot, tomorrow: boolean) => AnswerRow,
  byTime: (a: MinyanSlot, b: MinyanSlot) => number,
  where: (r: AnswerRow) => string,
  located: boolean,
): Answer | null {
  const { todayKey, tomorrowKey, onDay } = schedule
  if (!todayKey || !tomorrowKey || !onDay) return null
  const several = when.length > 1
  let approximate = false
  const slices = when.map((w) => {
    const key = w.day === 'tomorrow' ? tomorrowKey : w.day
    const slots = key === todayKey ? schedule.today : key === tomorrowKey ? schedule.tomorrow : onDay(key)
    const tefillos = ask.tefillos ?? w.tefillos
    const far = key !== todayKey && key !== tomorrowKey
    const found = slots
      .filter((s) => fits(s) && (!tefillos || tefillos.includes(s.tefillah)))
      .sort(byTime)
      .map((slot) => {
        const row = toRow(slot, false)
        if (far && slot.anchored) {
          approximate = true
          row.time = `~${row.time}`
        }
        return { slot, row: several ? { ...row, day: w.label } : row }
      })
    return { w, found }
  })
  const rows = slices.flatMap((x) => x.found.map((f) => f.row))
  const what = tefillahWords(ask.tefillos)
  const whatAll = ask.tefillos ? what : 'minyanim'
  const labels = when.map((w) => w.label).join(' or ')
  if (rows.length === 0) return { text: `No ${whatAll} listed for ${labels} in the guide.`, rows: [] }
  const note = approximate ? ' Times set by sunset (~) are worked out from today’s and may be a minute or two off.' : ''

  // "Shacharis Sunday at 7": that day's closest to the time.
  if (ask.at && !several) {
    const { w, found } = slices[0]
    const target = resolveAt(ask.at, ask.tefillos ?? w.tefillos, 0)
    const near = found.filter((f) => Math.abs(f.slot.minutes - target) <= AT_WINDOW).sort((a, b) => Math.abs(a.slot.minutes - target) - Math.abs(b.slot.minutes - target))
    if (near.length) {
      const best = near[0].row
      const more = near.length > 1 ? ` ${near.length - 1} more within ${AT_WINDOW} min.` : ''
      return { text: `Yes: ${best.label} at ${best.time} ${w.label}, ${where(best)}.${more}${note}`, rows: near.map((f) => f.row), when: w.label }
    }
    return { text: `No ${what} at ${formatClock(target)} ${w.label} in the guide.${note}`, rows, shown: 5, when: w.label }
  }

  const upper = (t: string) => t[0].toUpperCase() + t.slice(1)
  // The earliest is named; when another shul is nearer to where the visitor
  // is, that too ("Shacharis tomorrow" named Chabad of the Main Line at
  // 6:45, 6.1 mi, with Mekor Habracha 0.2 mi away at 6:55).
  const nearest = (found: { row: AnswerRow }[]) =>
    located && !several ? found.reduce((a, b) => ((b.row.miles ?? Infinity) < (a.row.miles ?? Infinity) ? b : a)) : found[0]
  const text = slices
    .filter((x) => x.found.length > 0)
    .map(({ w, found }) => {
      const first = found[0].row
      const near = nearest(found).row
      const nearText = near.shulName !== first.shulName ? ` Nearest: ${near.label} ${near.time}, ${where(near)}.` : ''
      return `${upper(w.label)}: ${first.label} ${first.time}, ${where(first)}${found.length > 1 ? `, and ${found.length - 1} more` : ''}.${nearText}`
    })
    .join(' ')
  return { text: `${text}${note}`, rows, shown: several ? 6 : 5, when: labels }
}

/** For "best pizza": the most upvoted, when upvotes actually tell them
 *  apart. Never a winner out of a tie: three places at zero upvotes have
 *  no best, and saying one did would be the guide making it up. A kind of
 *  place neighbors can't upvote has no ranking at all, and it says so. */
function withBest(result: AskResult, answer: Answer | null): Answer | null {
  const { query, hits } = result
  // One place is the answer; there's nothing to rank it against.
  if (!query.best || query.minyan || hits.length < 2) return answer
  const rest = answer ? ` ${answer.text}` : ''
  // "Better than Giant" is asking for somewhere else: the places that
  // aren't Giant answer it. A clear favorite among them is worth saying;
  // that there's no ranking isn't.
  const quiet = query.excluding.length > 0
  const ranked = hits.filter((h) => h.category.upvotesEnabled)
  if (ranked.length === 0) return quiet ? answer : { text: `${answer ? `${answer.text} ` : ''}The guide doesn't rank these.`, rows: answer?.rows ?? [] }
  const votes = (h: AskHit) => h.item.upvotes ?? 0
  const top = ranked.reduce((a, b) => (votes(b) > votes(a) ? b : a))
  const beaten = votes(top) > 0 && ranked.every((h) => h === top || votes(h) < votes(top))
  if (beaten) {
    const n = votes(top)
    return { text: `Most upvoted by neighbors: ${top.item.name}, ${n} ${n === 1 ? 'upvote' : 'upvotes'}.${rest}`, rows: answer?.rows ?? [] }
  }
  // A few sharing the top, with upvotes to share: name them together.
  const tied = ranked.filter((h) => votes(h) === votes(top))
  const names = [...new Set(tied.map((h) => h.item.name))]
  if (votes(top) > 0 && names.length <= 3 && tied.length < hits.length) {
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    const n = votes(top)
    const count = names.length === 1 ? `${n} ${n === 1 ? 'upvote' : 'upvotes'}` : `${n} each`
    return { text: `Most upvoted by neighbors: ${list}, ${count}.${rest}`, rows: answer?.rows ?? [] }
  }
  if (quiet) return answer
  return { text: `${answer ? `${answer.text} ` : ''}Not enough upvotes yet to say which is best.`, rows: answer?.rows ?? [] }
}

/** The answer to a search, or null when there's nothing to say beyond the
 *  results themselves. `result` should be unlimited (searchAsk with no
 *  `limit`), so counts ("3 places carry it") are true. */
export function answerFor(
  result: AskResult,
  options: {
    schedule?: AnswerSchedule | null
    coords?: LatLng | null
    /** The community's centre: with no location, two minyanim at the same
     *  time go to the shul nearer it, as the rows' own distances do. Only
     *  for that order; no distance is said from it. */
    center?: LatLng | null
  } = {},
): Answer | null {
  const answer = withBest(result, baseAnswer(result, options))
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
  { schedule = null, coords = null, center = null }: { schedule?: AnswerSchedule | null; coords?: LatLng | null; center?: LatLng | null },
): Answer | null {
  const { query, hits } = result
  if (!query.raw) return null

  if (query.minyan && schedule) {
    const answer = minyanAnswer(result, schedule, result.anchor?.geo ?? coords, center)
    if (answer) return answer
  }

  const asksOpen = query.openNow || query.openToday || !!query.openAt
  const later = query.openAt ? `${query.openAt.how} ${formatOpenAtTime(query.openAt.minutes)} today` : query.openNow ? 'right now' : 'for the rest of today'
  const { closedCount: closed, noHours } = result
  const noHoursNote = (more: boolean) =>
    noHours.length ? ` ${noHours.length}${more ? ' more' : ''} ${noHours.length === 1 ? 'has' : 'have'} no hours listed.` : ''

  if (asksOpen && hits.length === 0 && (closed > 0 || noHours.length > 0)) {
    // Saying "closed" of a place with no hours saved would be the guide
    // making it up; it says it doesn't know instead.
    const shut = query.openAt ? (closed === 1 ? "isn't open then" : "aren't open then") : closed === 1 ? 'is closed' : 'are closed'
    if (!noHours.length) {
      const but = query.openAt ? (closed === 1 ? "it isn't open then" : 'none are open then') : closed === 1 ? 'it is closed' : 'all are closed'
      return { text: `Nothing open ${later}. ${closed} ${closed === 1 ? 'place matches' : 'places match'}, but ${but}.`, rows: [] }
    }
    const closedNote = closed ? ` ${closed} ${shut}.` : ''
    return { text: `Nothing listed as open ${later}.${noHoursNote(false)}${closedNote}`, rows: [] }
  }

  if (hits.length === 0) return null
  const top = hits[0]
  const milesOf = (h: AskHit) => (h.miles != null ? `, ${milesText(h.miles)}` : '')
  const hoursOf = (h: AskHit) => {
    if (h.atTime) return h.atTime.length ? `, ${h.atTime.map(dayWindowText).join(', ')}` : ''
    return asksOpen && h.today.length ? `, ${hoursText(h, query.openNow)}` : ''
  }

  // A question about a place and nothing else ("food near HUP"): the
  // nearest one, measured from there. With something to look for too
  // ("sushi near HUP"), it's who has it, nearest to there first.
  const where = result.anchor?.name ?? result.place?.name ?? null
  // Words an admin taught the search, said as what they were read as, so
  // the filtering is never silent: "IKC dairy" is "2 food places: IKC,
  // Dairy", not two places with nothing said about why.
  const taught = taughtText(result)
  if (where && result.terms.length === 0) {
    const kind = `${kindOf(hits, Math.max(2, hits.length))}${taught ? ` (${taught})` : ''}`
    // "Food in Cherry Hill": how many there are; the list names them.
    if (result.place?.inside && !result.anchor) {
      const count = `${hits.length} ${hits.length === 1 ? `${kindOf(hits, 1)}${taught ? ` (${taught})` : ''}` : kind} in ${where}`
      return { text: hits.length === 1 ? `${count}: ${top.item.name}.` : `${count}.`, rows: [] }
    }
    return { text: `Closest ${kind} to ${where}: ${top.item.name}${milesOf(top)}.`, rows: [] }
  }
  if (taught && result.terms.length === 0 && !asksOpen) {
    const near = nearest(hits)
    if (hits.length === 1) return { text: `${near.item.name}: ${taught}${milesOf(near)}.`, rows: [] }
    const nearText = near.miles != null ? ` Nearest: ${near.item.name}${milesOf(near)}.` : ''
    return { text: `${hits.length} ${kindOf(hits)}: ${taught}.${nearText}`, rows: [] }
  }

  // A question about an item ("cholov yisroel milk"): who has it. Every
  // place with a matching item counts, however it words it: the nine stores
  // with cheese list "Sliced Cheeses", "Goat Cheese", "Cheese Sticks"…, and
  // counting only one wording said a single store had cheese. A place with
  // no item list counts by its own description: asked for pretzels, the
  // pretzel bakery has them as surely as the store with pretzel buns. But
  // only as good a match as the best: for "sliced goat cheese", a store with
  // plain "Goat Cheese" doesn't have it. Every word in the box counts, the
  // last one too, though it may still be being typed: "ice cream" looks
  // the same either way, and answered "10 places have ice" (Sep 28). A
  // word half typed then has no sentence for a moment, rather than one
  // about the words before it.
  // The words searched for, not the ones that said where ("pizza in center
  // city" asks about pizza) — see AskResult's `terms`.
  const searched = result.terms
  const asked = searched
  // How many of the words asked a place has: in its best-matching item, its
  // own description if it's a food place, and its name — "giant wine" is
  // GIANT's name and its Wine. A name alone counts only for a food place
  // ("Espresso Cafe & Sushi Bar" has sushi), and not when the question is
  // most of the name, which is looking the place up.
  const covers = (h: AskHit) => {
    const has = new Set<string>()
    const add = (text: string) => {
      const ws = words(text)
      for (const t of asked) if (termMatches(t, ws)) has.add(t)
    }
    if (h.matched.length) add(h.matched[0].tag)
    for (const f of h.matchedFields) if (f.describes) add(f.text)
    const food = describedByItsText(h.category)
    if (has.size === 0 && !food) return 0
    if (!food || coverage(h.item.name, asked) < words(h.item.name).length) add(h.item.name)
    return has.size
  }
  const best = Math.max(0, ...hits.map(covers))
  // Every word asked is in the top result's name, and they make up most of
  // it: that's looking the place up ("20th street pizza"), not asking who
  // has something. One word of "Center City Pretzel Co." isn't.
  const nameCovered = coverage(top.item.name, searched)
  const namesTop = nameCovered === searched.length && nameCovered * 2 > words(top.item.name).length
  // And only when some place has everything asked: "chalav yisrael ice
  // cream" is not answered by ShopRite's Chalav Yisroel Milk, nor "frozen
  // gefilte fish" by a fish market's frozen meat.
  const having = best > 0 && best === asked.length && !namesTop ? hits.filter((h) => covers(h) === best) : []
  if (having.length) {
    // On a category page the kind of place asked isn't a search word, but
    // it can be part of what's asked for ("shabbos meals" on Groceries).
    const thing = itemName(having, query.raw, asked, result.categoryIds ? [] : query.concepts.map((c) => c.word))
    const sometimes = having.filter((h) => h.matched.length > 0 && h.matched.every((m) => m.sometimes)).length
    const note = sometimes === having.length ? ' (only sometimes in stock)' : sometimes > 0 ? ` (${sometimes} only sometimes)` : ''
    const near = nearest(having)
    const closedNote = !asksOpen || !closed ? ''
      : query.openAt ? ` ${closed} more ${closed === 1 ? "isn't" : "aren't"} open then.`
      : ` ${closed} more ${closed === 1 ? 'is' : 'are'} closed ${later}.`
    // Measured from the place asked about, it says so: "8.1 mi from HUP".
    const fromAnchor = where && near.miles != null ? ` from ${where}` : ''
    if (having.length === 1) return { text: `${near.item.name} has ${thing}${note}${milesOf(near)}${fromAnchor}${hoursOf(near)}.${closedNote}`, rows: [] }
    const nearestLabel = where ? `Nearest to ${where}` : 'Nearest'
    const nearText = near.miles != null ? ` ${nearestLabel}: ${near.item.name}${milesOf(near)}${hoursOf(near)}.` : ''
    const open = query.openNow ? ' open' : query.openToday ? ' open today' : ''
    // "Than Giant": the places that aren't it.
    const besides = result.excluded.length ? ` besides ${[...new Set(result.excluded)].join(' or ')}` : ''
    // "Open after 6:00 PM today" is too long to go before "places".
    const openAt = query.openAt ? `, open ${later}` : ''
    return { text: `${having.length}${open} places${besides} have ${thing}${note}${openAt}.${nearText}${closedNote}`, rows: [] }
  }

  // Asked only what's open ("is there a mikvah open today"): what is, and
  // which of its hours — a mikvah's men's hours are not its women's.
  if (query.openAt) {
    const near = nearest(hits)
    const hoursNear = near.atTime?.map(dayWindowText).join(', ') ?? ''
    if (hits.length === 1) return { text: `${near.item.name}: ${hoursNear}${milesOf(near)}.${noHoursNote(true)}`, rows: [] }
    const count = `${hits.length} ${kindOf(hits)} open ${later}`
    const example = near.miles != null ? `. Nearest: ${near.item.name}, ${hoursNear}${milesOf(near)}.` : `, such as ${near.item.name} (${hoursNear}).`
    return { text: `${count}${example}${noHoursNote(true)}`, rows: [] }
  }
  if (asksOpen) {
    const near = nearest(hits)
    if (hits.length === 1) return { text: `${near.item.name}: ${hoursText(near, query.openNow)}${milesOf(near)}.${noHoursNote(true)}`, rows: [] }
    const kind = kindOf(hits)
    const count = `${hits.length} ${kind} open ${query.openNow ? 'now' : 'today'}`
    // "Nearest" only with somewhere to measure from; otherwise just one of them.
    const example =
      near.miles != null
        ? `. Nearest: ${near.item.name}, ${hoursText(near, query.openNow)}${milesOf(near)}.`
        : `, such as ${near.item.name} (${hoursText(near, query.openNow)}).`
    return { text: `${count}${example}${noHoursNote(true)}`, rows: [] }
  }

  return null
}

/** The filters taught words were read as, in the listings' own words
 *  ("IKC, Dairy", "Shabbat Friendly"), or null when none were used. A
 *  word taught as a kind of place says nothing here: the kind is said. */
function taughtText(result: AskResult): string | null {
  const taught = result.taught ?? []
  const said = taught.flatMap((t) => {
    if (!t.field) return []
    // One word read as several picks ("orthodox": both Orthodox
    // denominations) is said as it was typed.
    if (taught.filter((x) => x.word === t.word && x.field).length > 1) {
      const typed = termsAsTyped(result.query.raw, t.word.split(' '))
      return typed ? [typed[0].toUpperCase() + typed.slice(1)] : []
    }
    const field = result.hits.find((h) => h.category.id === t.categoryId)?.category.detailFields.find((f) => f.key === t.field)
    if (!field) return []
    if (t.value === undefined) return [field.filterLabel ?? field.label]
    return [field.options?.find((o) => o.value === t.value)?.label ?? t.value]
  })
  return said.length ? [...new Set(said)].join(', ') : null
}

/** What to call some hits: their category's plural when they share one and
 *  it reads as a plural ("synagogues"), "food places" for a category named
 *  like a mass noun ("Food", "Grocery"), "places" for a mix. */
function kindOf(hits: AskHit[], count = hits.length): string {
  const kinds = new Set(hits.map((h) => h.category.id))
  if (kinds.size !== 1) return count === 1 ? 'place' : 'places'
  const { label, pluralLabel } = hits[0].category
  if (count === 1) return label.toLowerCase()
  return pluralLabel !== label ? pluralLabel.toLowerCase() : `${label.toLowerCase()} places`
}

/** The nearest of some hits, or the best match when there's no distance. */
function nearest(hits: AskHit[]): AskHit {
  return hits.reduce((best, h) => (h.miles != null && (best.miles == null || h.miles < best.miles) ? h : best), hits[0])
}

/** What to call the item asked about: the listings' own word for it when
 *  they agree ("Chalav Yisroel Milk"), the asker's when they don't. */
function itemName(having: AskHit[], raw: string, terms: string[], beside: string[] = []): string {
  const tops = new Set(having.map((h) => h.matched[0]?.tag ?? ''))
  if (tops.size === 1 && !tops.has('')) return [...tops][0]
  tops.delete('')
  const typed = termsAsTyped(raw, terms, beside)
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

/** "open 11:00 AM–9:00 PM", "Women's 8:00 PM–10:00 PM": a stretch of
 *  today's hours in full, for "open after 6", where both ends matter. */
function dayWindowText(w: DayWindow): string {
  return w.label ? `${w.label} ${w.opens}–${w.closes}` : `open ${w.opens}–${w.closes}`
}

function windowText(w: HoursWindow): string {
  const when = w.openNow ? `open until ${w.closes}` : `opens ${w.opens}`
  return w.label ? `${w.label} ${when}` : when
}

/** For a result of an "open now" or "open today" question: the line that
 *  says why it's there — "Open until 9:00 PM", "Women's opens 8:00 PM" — or
 *  that it has no hours listed. Null for any other question. */
export function hitHoursNote(hit: AskHit, query: AskResult['query']): { text: string; known: boolean } | null {
  if (!query.openNow && !query.openToday && !query.openAt) return null
  if (hit.open === null) return { text: 'No hours listed', known: false }
  if (hit.atTime) {
    const text = hit.atTime.map(dayWindowText).join(', ')
    return text ? { text: text[0].toUpperCase() + text.slice(1), known: true } : null
  }
  const text = hoursText(hit, query.openNow)
  if (!text) return null
  return { text: text[0].toUpperCase() + text.slice(1), known: true }
}

/** For a question that found nothing, the answer to the closest one that
 *  did (see nearMiss): says plainly that the question itself isn't in the
 *  guide, then what is — "Nothing in the guide for “packaged pretzels”.
 *  3 places have pretzels. Nearest: ALDI, 0.8 mi." Never passes the near
 *  miss off as the thing asked for. */
export function nearMissAnswer(miss: NearMiss, raw: string, options: { coords?: LatLng | null } = {}): Answer {
  const { hits } = miss.result
  const kind = kindOf(hits)
  const closest =
    answerFor(miss.result, options)?.text ?? `Closest: ${hits.length} ${kind} with “${miss.kept}”.`
  return { text: `Nothing in the guide for “${raw}”. ${closest}`, rows: [], closest: true }
}

/** "Is the eruv up?" The guide can't know: each eruv posts its own status,
 *  and a week-old "yes" copied here would be worse than none. So the answer
 *  is where to look, each eruv with what it covers, and the guide's own
 *  page about them. */
export function eruvAnswer(eruvim: readonly Pick<EruvRecord, 'name' | 'area' | 'statusLink'>[], pageHref: string | null): Answer {
  const links: AnswerLink[] = eruvim.map((e) => ({ label: e.name, detail: e.area, href: e.statusLink, external: true }))
  if (pageHref) links.push({ label: 'More about the eruvim', href: pageHref, external: false })
  const text = eruvim.length
    ? "The guide can't say whether an eruv is up this week: each one posts its own status. Check before Shabbos:"
    : "The guide can't say whether an eruv is up this week. See what it has:"
  return { text, rows: [], links }
}

/** "When is candle lighting?", "when does Shabbos end?", "shkia": straight
 *  from the zmanim the home screen's Shabbos card shows, so the two never
 *  disagree. A Yom Tov coming before Shabbos is named too, as the card
 *  does. `zmanim` is null while they load, and `failed` when they couldn't
 *  be; the answer says so rather than falling through to "nothing in the
 *  guide". */
export function timesAnswer(
  times: TimesAsk,
  zmanim: ZmanimData | null,
  { nowMs, pageHref, failed = false }: { nowMs: number; pageHref: string | null; failed?: boolean },
): Answer {
  const links: AnswerLink[] = pageHref ? [{ label: 'All zmanim', href: pageHref, external: false }] : []
  if (!zmanim) return { text: failed ? "Couldn't load the times just now." : 'Looking up the times…', rows: [], links }
  const at = (e: { label: string; time: string }) => `${e.label}, ${e.time}`
  if (times !== 'candles' && times !== 'havdalah' && times !== 'shabbos') {
    const z = zmanim.dailyZmanim.find((e) => e.label === times)
    return { text: z ? `${z.label} today: ${z.time}.` : `No ${times.toLowerCase()} time for today.`, rows: [], links }
  }
  const lines: string[] = []
  const holiday = zmanim.holidayPeriod && resolvePrimaryZmanimBlock(zmanim, nowMs) === 'holiday' ? zmanim.holidayPeriod : null
  const { candleLighting, havdalah } = zmanim.shabbos
  // Once a Yom Tov has begun, its start is history: what's asked is the
  // next candle lighting in it (the second night's), if there is one.
  const ahead = (e: { iso?: string }) => !e.iso || Date.parse(e.iso) > nowMs
  if (times !== 'havdalah') {
    if (holiday) {
      const next = holiday.candleLightings.find(ahead)
      if (ahead(holiday.begins)) lines.push(`${holiday.name} begins ${at(holiday.begins)}.`)
      else if (next && next.iso !== candleLighting?.iso) lines.push(`${holiday.name} candle lighting: ${at(next)}.`)
    }
    if (candleLighting) lines.push(`Candle lighting: ${at(candleLighting)}.`)
  }
  if (times !== 'candles') {
    if (holiday) lines.push(`${holiday.name} ends ${at(holiday.ends)}.`)
    if (havdalah) lines.push(`Shabbos ends: ${at(havdalah)}.`)
  }
  return { text: lines.join(' ') || "Couldn't find this week's times.", rows: [], links }
}

/** "12 grocery stores", "1 hotel", "73 food places": a count of one kind. */
function countOf(category: CategoryConfig, n: number): string {
  const kind = n === 1 ? category.label.toLowerCase() : category.pluralLabel !== category.label ? category.pluralLabel.toLowerCase() : `${category.label.toLowerCase()} places`
  return `${n} ${kind}`
}

/** Questions about the guide itself (see AskQuery.meta): what's on it,
 *  what to ask, who keeps it, how to add to it. Counts come from the
 *  listings visitors can see, so "what's here" is never out of date. */
export function metaAnswer(
  meta: MetaAsk,
  ctx: {
    listings: readonly DirectoryResource[]
    categories: readonly CategoryConfig[]
    aboutHref: string
    /** The Add form of the kind of place the question named, if any. */
    addTo?: { label: string; href: string } | null
  },
): Answer {
  if (meta === 'contents') {
    const byKind = ctx.categories
      .filter((c) => c.kind === 'listing')
      .map((c) => ({ c, n: ctx.listings.filter((l) => l.category === c.id).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
    const total = byKind.reduce((sum, x) => sum + x.n, 0)
    const shown = byKind.slice(0, 4).map((x) => countOf(x.c, x.n))
    const more = byKind.length > shown.length ? ', and more' : ''
    return {
      text: `${total} listings, kept by the community: ${shown.join(', ')}${more}. Ask about any of it, the way you'd ask a neighbor.`,
      rows: [],
      links: [{ label: 'About the guide', href: ctx.aboutHref, external: false }],
    }
  }
  if (meta === 'ask') {
    return {
      text: 'Ask the way you\'d ask a neighbor: where to get something ("where can I get challah"), what\'s open ("bagels open now"), the next minyan, or when candle lighting is. Every answer comes from what\'s in the guide.',
      rows: [],
    }
  }
  if (meta === 'about') {
    return {
      text: 'The guide is kept by the community: anyone can add or correct a listing, and an admin checks each change before it goes live.',
      rows: [],
      links: [{ label: 'About the guide', href: ctx.aboutHref, external: false }],
    }
  }
  return {
    text: ctx.addTo
      ? `Anyone can add one. An admin checks it before it goes live.`
      : 'Open the kind of place it is and tap "Add a listing", or "Suggest an edit" on one that\'s there. An admin checks each change before it goes live.',
    rows: [],
    links: ctx.addTo ? [{ label: `Add a ${ctx.addTo.label.toLowerCase()} listing`, href: ctx.addTo.href, external: false }] : [],
  }
}
