import { answerFor } from './askAnswer'
import { parseAsk, withoutOpenWords } from './ask'
import { cardMatches, categoryCards } from './cardSearch'
import { nearMiss, searchAsk, type AskHit, type AskResult } from './askSearch'
import { resolveCapabilities, type CategoryConfig } from './categories'
import type { Place } from './places'
import type { DirectoryResource } from '@/types'

// ── The admin's "Missed searches" list ───────────────────────────────────────
// Every search that found nothing is counted by its text, per day (see
// /api/counts and daily_count). This turns those counts into the admin's
// seeding to-do list: most asked first, and each one run again through
// today's search, so the list says what's true now rather than what was true
// when it was typed:
//
//   - missing: still nothing, and nothing close either. Content to add.
//   - close:   nothing as asked, but a looser question finds something
//              ("packaged pretzels" → places with pretzels). Either the item
//              is missing from a store that's listed, or the wording beat
//              the search. The places shown let the admin tell which.
//   - found:   today's search answers it. Someone added it since, search got
//              better, or it was typed into one category's own search box
//              and lives in another category. Nothing to do.
//
// "Open now" and "open today" are left out when judging. The admin's clock
// isn't the visitor's: "pizza open now" typed at 11 PM would read as found
// or not depending on when the admin looked. What the list can say for sure
// is whether the guide has pizza, and it says the hours decided the rest.

export type MissCountRow = { key: string; day: string; count: number }

export type MissTally = {
  term: string
  count: number
  /** YYYY-MM-DD, the community's own day. */
  lastDay: string
  /** ISO timestamp, or null when it's not dismissed. */
  dismissedAt: string | null
}

/** Adds up each search's daily counts, most searched first, then most
 *  recent. */
export function tallyMisses(rows: readonly MissCountRow[], dismissed: ReadonlyMap<string, string>): MissTally[] {
  const byTerm = new Map<string, MissTally>()
  for (const row of rows) {
    const t = byTerm.get(row.key)
    if (t) {
      t.count += row.count
      if (row.day > t.lastDay) t.lastDay = row.day
    } else {
      byTerm.set(row.key, { term: row.key, count: row.count, lastDay: row.day, dismissedAt: dismissed.get(row.key) ?? null })
    }
  }
  return [...byTerm.values()].sort((a, b) => b.count - a.count || b.lastDay.localeCompare(a.lastDay) || a.term.localeCompare(b.term))
}

export type MissPlace = { id: string; name: string; category: string }

export type MissVerdict =
  | { kind: 'missing' }
  | { kind: 'close'; summary: string; places: MissPlace[] }
  | { kind: 'found'; summary: string; places: MissPlace[] }

export type ClassifiedMiss = MissTally & {
  verdict: MissVerdict
  /** The one kind of place the search named ("vegan food" → food), when
   *  it takes new listings: where "Add a listing" should start. */
  askedCategory: string | null
}

const SHOWN_PLACES = 3

function placesOf(hits: readonly AskHit[]): MissPlace[] {
  return hits.slice(0, SHOWN_PLACES).map((h) => ({ id: h.item.id, name: h.item.name, category: h.item.category }))
}

function summarize(result: AskResult): string {
  const said = answerFor(result)?.text
  if (said) return said
  const n = result.hits.length
  return `${n} ${n === 1 ? 'place matches' : 'places match'}.`
}

export function classifyMiss(
  tally: MissTally,
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  { places = [], now = new Date() }: { places?: readonly Place[]; now?: Date } = {},
): ClassifiedMiss {
  const options = { places, now }
  const asked = parseAsk(tally.term)
  // "What's on this site": answered about the guide itself.
  if (asked.meta) return { ...tally, askedCategory: null, verdict: { kind: 'found', summary: 'Answered about the guide itself.', places: [] } }
  // "When is candle lighting": answered from the zmanim.
  if (asked.times) return { ...tally, askedCategory: null, verdict: { kind: 'found', summary: 'Answered from the zmanim.', places: [] } }
  // "Is the eruv up": answered with where each eruv posts its status.
  if (asked.eruv && categories.some((c) => c.kind === 'eruv')) {
    return { ...tally, askedCategory: null, verdict: { kind: 'found', summary: "Answered with each eruv's status link.", places: [] } }
  }
  const asksOpen = asked.openNow || asked.openToday || !!asked.openAt
  // A trailing space when anything was taken out: what's left was typed in
  // full, not a word still being typed (see AskQuery.partial).
  // "What's open" alone leaves nothing to look for, so it's judged as asked.
  const timeless = asksOpen ? withoutOpenWords(tally.term) : ''
  const text = timeless ? `${timeless} ` : tally.term
  const result = searchAsk(listings, categories, text, options)
  const hoursNote = timeless ? ' It asked what’s open, so the hours decided whether any showed.' : ''
  const kind = result.categoryIds?.length === 1 ? categories.find((c) => c.id === result.categoryIds![0]) : undefined
  const askedCategory = kind && resolveCapabilities(kind.capabilities).add ? kind.id : null

  if (result.hits.length > 0) {
    return { ...tally, askedCategory, verdict: { kind: 'found', summary: summarize(result) + hoursNote, places: placesOf(result.hits) } }
  }
  // A page the home screen's own cards answer with ("eruv" → the Eruv
  // page). Matched on the words alone, not on the kind of place: "vegan
  // food" names the food card, but finding no vegan food is still a gap.
  const pages = categoryCards(categories).filter((card) => cardMatches(card, text))
  if (pages.length > 0) {
    const names = pages.map((p) => p.title).join(', ')
    return { ...tally, askedCategory, verdict: { kind: 'found', summary: `Matches the ${names} ${pages.length === 1 ? 'page' : 'pages'}.`, places: [] } }
  }
  const miss = nearMiss(listings, categories, text, options)
  if (miss) {
    const summary = `Without “${miss.dropped}”: ${summarize(miss.result)}`
    return { ...tally, askedCategory, verdict: { kind: 'close', summary, places: placesOf(miss.result.hits) } }
  }
  return { ...tally, askedCategory, verdict: { kind: 'missing' } }
}
