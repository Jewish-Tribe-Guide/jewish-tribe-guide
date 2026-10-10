import { answerFor } from './askAnswer'
import { formatOpenAtTime, parseAsk, withoutOpenWords } from './ask'
import { searchAsk, type AskResult } from './askSearch'
import type { CategoryConfig } from './categories'
import type { Place } from './places'
import type { DirectoryResource } from '@/types'
import { eruvim } from '@/data/resources'

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
  if (asked.meta) {
    return {
      contents: 'What the guide has, and how the community keeps it.',
      ask: 'What you can ask the guide, and how it answers.',
      about: 'Who keeps the guide, and how.',
      add: 'How to add a listing to the guide.',
    }[asked.meta]
  }
  // Times change weekly or daily, and depend on where: the page works
  // them out when it's opened.
  if (asked.times) {
    if (asked.times === 'candles') return "This week's candle lighting, worked out when you open it."
    if (asked.times === 'havdalah') return 'When Shabbos ends this week, worked out when you open it.'
    if (asked.times === 'shabbos') return "This week's candle lighting and havdalah, worked out when you open it."
    return `Today's ${asked.times.toLowerCase()}, worked out when you open it.`
  }
  if (asked.eruv && categories.some((c) => c.kind === 'eruv')) {
    return eruvim.length
      ? `Each eruv posts its own status: ${eruvim.map((e) => e.name).join(' and ')}. Open for the links.`
      : 'Where to check the eruv before Shabbos.'
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

// ── What a shared answer and a question to the group say (agreed Oct 1) ──────

const ASKS = /^(where|who|what|which|when|how|is|are|does|do|did|can|any|anyone|anybody)\b/i

/** The question as a sentence ending in "?": "Where can I get challah?" for
 *  a bare "challah", the asker's own words when they asked one. */
export function asQuestion(question: string): string {
  const q = question.trim().replace(/[?.!\s]+$/, '')
  return ASKS.test(q) ? `${questionTitle(q)}?` : `Where can I get ${q}?`
}

/** What "Share this answer" sends with the link: the question and the
 *  answer, so a preview that never loads still says something. The answer
 *  is the preview's own (shareSummary): nothing tied to the hour, or to
 *  where the sender is standing. */
export function shareMessage(question: string, summary: string): string {
  return `${asQuestion(question)} ${summary}`
}

/** What "Ask in a WhatsApp group" writes for the visitor to send: the
 *  question, and the question's own link (sent with it), which answers it
 *  once someone adds it to the guide. */
export function askMessage(question: string): string {
  const q = asQuestion(question)
  const asked = /^Where can I get /.test(q) ? q.replace(/^Where can I get /, 'Does anyone know where to get ') : q
  return `${asked} It’s not in the guide yet. If you know, add it there and this link will answer it:`
}

/** The question a category page shares: its own words when they already
 *  name the category ("kosher bakery"), otherwise with the category named
 *  ("food open now" for "open now" asked on Food), so the link opens
 *  answering the same thing. */
export function categoryQuestion(question: string, category: CategoryConfig, categories: readonly CategoryConfig[]): string {
  const named = searchAsk([], categories, question).categoryIds
  return named?.length === 1 && named[0] === category.id ? question : `${category.label.toLowerCase()} ${question}`
}
