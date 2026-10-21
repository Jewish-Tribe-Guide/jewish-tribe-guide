import { decode, htmlToText, siteOf } from '@/lib/menuReader'

// Finding a place's pages of hours from its own website, as findMenus finds
// a menu (the user, Oct 21: "Food places, shuls and mikvahs start from the
// website Google gave us, and the reader finds the right page on it").
// Written for mikvahs: Lower Merion's women's hours are on its home page, its
// men's and keilim hours on pages of their own, Ohel Leah's kelim hours on
// its Kelim Mikvah page.

/** Pages read besides the home page. */
export const MAX_HOURS_PAGES = 4

// Best first: what a page of hours is called, then the pages a mikvah gives
// one kind of hours on, then where hours sometimes are.
const HOURS = /\b(hours|schedule|times|open)\b/
const APPOINTMENTS = /\b(appointments?|book|booking)\b/
const ONE_KIND = /\b(men|mens|men’s|men's|keilim|kelim|kailim|women|womens|women’s|women's|ladies|dishes|utensils)\b/
const SOMETIMES = /\b(faqs?|contact|contact us|visit|visiting|what to expect|information|info)\b/
// Never a page of hours, whatever its link says.
const NOT_HOURS = /\b(donate|donation|donations|fundraiser|campaign|cart|checkout|pay|payment|login|account|membership-?form|blog|news|gallery|photos)\b/

/** Links on a page, on the same website, that may give its hours: best
 *  first, in page order within each. The home page itself isn't one. */
export function hoursLinks(html: string, base: string): string[] {
  const site = new URL(base)
  const own = siteOf(site.hostname)
  const home = new URL('/', site).toString()
  const found = new Map<string, number>()
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
    url.search = ''
    if (!/^https?:$/.test(url.protocol) || siteOf(url.hostname) !== own) continue
    if (/\.(jpe?g|png|gif|webp|svg|zip|docx?)$/i.test(url.pathname)) continue
    const words = `${htmlToText(m[3])} ${decodeURIComponent(url.pathname).replace(/[-_/]+/g, ' ')}`.toLowerCase()
    if (NOT_HOURS.test(words)) continue
    const score = HOURS.test(words) ? 4 : APPOINTMENTS.test(words) ? 3 : ONE_KIND.test(words) ? 3 : SOMETIMES.test(words) ? 1 : 0
    if (score === 0) continue
    const key = url.toString()
    if (key === home || key === site.toString()) continue
    found.set(key, Math.max(found.get(key) ?? 0, score))
  }
  return [...found].sort((a, b) => b[1] - a[1]).map(([url]) => url)
}

/** The pages to read a place's hours from: its home page, then up to
 *  MAX_HOURS_PAGES of its links (hoursLinks). */
export function hoursPages(homeUrl: string, html: string): string[] {
  return [homeUrl, ...hoursLinks(html, homeUrl).slice(0, MAX_HOURS_PAGES)]
}
