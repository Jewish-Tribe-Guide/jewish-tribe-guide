import { answerFor } from './askAnswer'
import { formatOpenAtTime, parseAsk, withoutOpenWords } from './ask'
import { searchAsk, type AskResult } from './askSearch'
import type { CategoryConfig } from './categories'
import type { Place } from './places'
import type { DirectoryResource } from '@/types'

export { questionFromSlug, questionSlug } from './routes'

// ── "Share this answer" ──────────────────────────────────────────────────────
// A question gets its own page, /philly/ask/challah-near-rittenhouse, which
// opens the home screen with the question already asked, and a link preview
// that answers it. The point is WhatsApp: someone asks in the group, a
// neighbor replies with the link, and everyone in the group sees the guide
// answer a question.
//
// Its own route rather than /philly?q=…: the home page is prerendered and
// reads no query string, and making it read one would make every visit to
// it dynamic (a Suspense boundary for exactly that once turned its content
// into an empty shell; see AGENTS.md).

/** "food places", "hotels", "places": what a count of results is of. */
function kindOf(result: AskResult, categories: readonly CategoryConfig[]): string {
  const n = result.hits.length
  const c = result.categoryIds?.length === 1 ? categories.find((x) => x.id === result.categoryIds![0]) : undefined
  if (!c) return n === 1 ? 'place' : 'places'
  if (n === 1) return c.label.toLowerCase()
  return c.pluralLabel !== c.label ? c.pluralLabel.toLowerCase() : `${c.label.toLowerCase()} places`
}

/** "Where can I get challah" from "where can i get challah": how the link
 *  preview's title shows the question, which the link carries in lower
 *  case. */
export function questionTitle(question: string): string {
  const fixed = question.replace(/\bi\b/g, 'I').replace(/\bi(['’])/g, 'I$1')
  return fixed.charAt(0).toUpperCase() + fixed.slice(1)
}

/**
 * What the link preview says: the answer, as far as it holds whenever the
 * preview is read. WhatsApp keeps a preview for days, so nothing that
 * depends on the hour goes in it. "Bagels open now" previews as which places
 * have bagels, and says the page shows what's open; a minyan question says
 * the page has the times.
 */
export function shareSummary(
  question: string,
  listings: readonly DirectoryResource[],
  categories: readonly CategoryConfig[],
  places: readonly Place[] = [],
): string {
  const asked = parseAsk(question)
  // A fixed clock: the preview mustn't depend on when it was made, and the
  // hours are left out of it below anyway.
  const options = { places, now: new Date(0) }
  if (asked.minyan) {
    const shuls = searchAsk(listings, categories, question, options).hits.length
    return shuls ? `Minyan times from ${shuls} ${shuls === 1 ? 'shul' : 'shuls'} in the guide, worked out when you open it.` : 'Minyan times from the guide.'
  }
  const at = asked.openAt
  const hoursAsked = asked.openNow || asked.openToday || !!at
  const timeless = hoursAsked ? withoutOpenWords(question) : question
  const when = at ? `${at.how} ${formatOpenAtTime(at.minutes)}` : asked.openNow ? 'now' : 'today'
  // "What's open after 10": nothing to look for but the hours themselves.
  if (hoursAsked && !timeless) return `Open to see what's open ${when}, from the hours in the guide.`
  const result = searchAsk(listings, categories, hoursAsked ? `${timeless} ` : question, options)
  if (result.hits.length === 0) return 'Not in the guide yet. Know where to find it? Add it to the guide.'
  const said = answerFor(result)?.text ?? `${result.hits.length} ${kindOf(result, categories)} in the guide.`
  if (!hoursAsked) return said
  return `${said} Open to see which are open ${when}.`
}
