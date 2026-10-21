import { decode, htmlToText, siteOf } from '@/lib/menuReader'

// Finding a place's pages of hours from its own website, as findMenus finds
// a menu (the user, Oct 21: "Food places, shuls and mikvahs start from the
// website Google gave us, and the reader finds the right page on it").
// Written for mikvahs: Lower Merion's women's hours are on its home page, its
// men's and keilim hours on pages of their own, Ohel Leah's kelim hours on
// its Kelim Mikvah page.

/** Pages read besides the home page. */
export const MAX_HOURS_PAGES = 4

/** What a link's words score, best first; a link scoring none isn't read. */
type Scoring = readonly (readonly [RegExp, number])[]

// A mikvah's: what a page of hours is called, then the pages a mikvah gives
// one kind of hours on, then where hours sometimes are.
const HOURS_WORDS: Scoring = [
  [/\b(hours|schedule|times|open)\b/, 4],
  [/\b(appointments?|book|booking)\b/, 3],
  [/\b(men|mens|men’s|men's|keilim|kelim|kailim|women|womens|women’s|women's|ladies|dishes|utensils)\b/, 3],
  [/\b(faqs?|contact|contact us|visit|visiting|what to expect|information|info)\b/, 1],
]

// A shul's (step 4, Oct 21): what a page of davening times is called, then
// where a week's times often are, then where they sometimes are.
const TIMES_WORDS: Scoring = [
  [/\b(davening|daven|minyan|minyans|minyanim|services|service times|schedule|times|zmanim|prayer|prayers|tefill?ah|tefillot|worship)\b/, 4],
  [/\b(shabbat|shabbos|calendar|weekly|this week|bulletin|newsletter)\b/, 2],
  [/\b(visit|visiting|about|contact|info|information)\b/, 1],
]
// Never a page of hours, whatever its link says.
const NOT_HOURS = /\b(donate|donation|donations|fundraiser|campaign|cart|checkout|pay|payment|login|account|membership-?form|blog|news|gallery|photos)\b/

const slashless = (u: string) => u.replace(/\/+(?=$|\?)/, '')

/** A link that may give hours: where it goes, and what it's called. */
export type HoursLink = { url: string; text: string }

/** Links on a page, on the same website, that may give its hours: best
 *  first, in page order within each, each with the words it's linked by
 *  (the first, or the best). The home page itself isn't one. */
export function hoursLinks(html: string, base: string, scoring: Scoring = HOURS_WORDS): HoursLink[] {
  const site = new URL(base)
  const own = siteOf(site.hostname)
  const home = new URL('/', site).toString()
  const found = new Map<string, { url: string; score: number; text: string }>()
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decode(m[2].trim())
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue
    let url: URL
    try {
      url = new URL(href, site)
    } catch {
      continue
    }
    url.hash = ''
    // A query is kept: some sites' pages are one script and a page number
    // (Leyv Ha-Ir's worship page is index.cfm?…&pageId=500). Only tracking
    // is dropped.
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(k)) url.searchParams.delete(k)
    if (!/^https?:$/.test(url.protocol) || siteOf(url.hostname) !== own) continue
    if (/\.(jpe?g|png|gif|webp|svg|zip|docx?)$/i.test(url.pathname)) continue
    const text = htmlToText(m[3]).replace(/\s+/g, ' ').trim()
    const words = `${text} ${decodeURIComponent(url.pathname).replace(/[-_/]+/g, ' ')}`.toLowerCase()
    if (NOT_HOURS.test(words)) continue
    const score = scoring.find(([re]) => re.test(words))?.[1] ?? 0
    if (score === 0) continue
    // One page, whether its link ends in a slash or not (Rodeph Shalom
    // links /calendar and /calendar/): kept as it was first linked.
    const key = slashless(url.toString())
    if (key === slashless(home) || key === slashless(site.toString())) continue
    const had = found.get(key)
    if (!had || score > had.score) found.set(key, { url: had?.url ?? url.toString(), score, text: text || had?.text || '' })
    else if (!had.text) had.text = text
  }
  return [...found.values()].sort((a, b) => b.score - a.score).map(({ url, text }) => ({ url, text }))
}

/** A page to read a place's hours from: its home page (link null), or one
 *  of its links, by the words it's linked by. */
export type HoursPage = { url: string; link: string | null }

/** The pages to read a place's hours from: its home page, then up to
 *  MAX_HOURS_PAGES of its links (hoursLinks). */
export function hoursPages(homeUrl: string, html: string, scoring: Scoring = HOURS_WORDS): HoursPage[] {
  return [{ url: homeUrl, link: null }, ...hoursLinks(html, homeUrl, scoring).slice(0, MAX_HOURS_PAGES).map((l) => ({ url: l.url, link: l.text || null }))]
}

/** A shul's pages of davening times, the same way: its home page, then up
 *  to MAX_HOURS_PAGES links called davening, minyanim, services… */
export function timesPages(homeUrl: string, html: string): HoursPage[] {
  return hoursPages(homeUrl, html, TIMES_WORDS)
}
