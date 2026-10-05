// A watched website: read it, keep its words' fingerprint, and say whether
// they changed since last time (freshness map, Oct 5). Server-only.
//
// "Changed" is the signal, not a verdict: a page that changed gets looked at
// (by an admin now; by the AI week reader for a shul's times next), a page
// that didn't is left alone.

import { createHash } from 'node:crypto'
import type { WatchOutcome } from './watches'

/** How every watch asks for a page: a browser's ordinary headers, with an
 *  agent that still names the guide. Measured Oct 5 against the pages the
 *  guide watches: Lower Merion's and Sons of Israel's sites answer 406
 *  without them, Keystone-K's answers 403 to the usual bot form
 *  ("compatible;"). Not a disguise: the guide's name is in it.
 *
 *  Some shul sites still refuse now and then (a firewall scoring requests:
 *  the same address gave 200 and 406 minutes apart). That is not worked
 *  around: the watch shows as not working, the admin is told, and that
 *  shul's times come from its newsletter or the Add box instead. */
export const WATCH_FETCH_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 PhillyJewishGuide/1.0',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
}

/** A page's readable words, so a change to its markup, scripts or styling
 *  isn't a change. */
export function pageWords(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pageHash(html: string): string {
  return createHash('sha256').update(pageWords(html)).digest('hex')
}
/** A page with fewer words than this didn't really load (a firewall's
 *  challenge page, an empty shell that builds itself in the browser). */
export const MIN_PAGE_WORDS = 30

/** Reads a page and fingerprints its words. Never throws: a page that
 *  can't be read is a failed run, with the reason. */
export async function readWebsite(url: string, fetcher: typeof fetch = fetch): Promise<WatchOutcome> {
  let res: Response
  try {
    res = await fetcher(url, {
      headers: WATCH_FETCH_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    return { ok: false, error: `Couldn\u2019t reach the page (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!res.ok) return { ok: false, error: `The page answered ${res.status}` }
  const html = await res.text()
  const words = pageWords(html)
  if (words.split(' ').length < MIN_PAGE_WORDS) {
    return { ok: false, error: 'The page came back nearly empty (blocked, or built in the browser)' }
  }
  return { ok: true, filed: 0, pageHash: createHash('sha256').update(words).digest('hex') }
}
