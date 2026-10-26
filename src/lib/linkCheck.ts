import type { CategoryConfig } from './categories'
import { samePage } from './hoursJob'
import type { Watch } from './watches'

// ── The links a listing shows, checked once a week (Oct 25) ─────────────────
// A listing shows links nothing else reads: a kosher certificate, a
// WhatsApp group, a page on Refuah, a website typed in. Once a week each
// is opened, to see it's still there: no AI, nothing read, only whether
// it answers (the user, Oct 25: "let's also add a check for links").
//
// Which links: every link field a listing has filled in, less the ones
// something else already opens. Its website when Google keeps it
// (`details.googleFields`) or a watch reads that site every night; any
// link a watch reads (a menu, a hospital's Refuah page).
//
// Each link's last check is kept on a record of its own, a watch that's
// never run (`active: false`, LINK_CHECK_CREATOR), as the hours job keeps
// its searches: `pageHash` holds the link it opened, so a link edited
// since isn't judged by the old one's answer. A link that doesn't open
// shows as Not checked on its place's row.
//
// Pure: linkCheckRun.ts opens them and keeps the records.

export const LINK_CHECK_CREATOR = 'link check'

/** Its record's address: never a real page. */
export const linkCheckUrl = (resourceId: string, key: string) => `https://guide.invalid/link-check/${resourceId}/${key}`

export const isLinkCheck = (w: Pick<Watch, 'createdBy'>) => w.createdBy === LINK_CHECK_CREATOR

/** One link a listing shows. `field`: its field's name ("Kosher
 *  certificate"). */
export type ListingLink = { resourceId: string; key: string; field: string; url: string }

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

const pathOf = (url: string) => url.replace(/[?#].*$/, '')

/** The links of a listing to check: each link field it has filled in
 *  with a web address, less what something else opens. */
export function linksToCheck(
  place: { id: string; details: Record<string, unknown> },
  category: Pick<CategoryConfig, 'detailFields'>,
  watches: readonly Pick<Watch, 'url' | 'active' | 'resourceId' | 'createdBy'>[],
): ListingLink[] {
  const google = Array.isArray(place.details.googleFields) ? (place.details.googleFields as unknown[]) : []
  const read = watches.filter((w) => w.active)
  const ownHosts = new Set(read.filter((w) => w.resourceId === place.id).map((w) => hostOf(w.url)))
  return category.detailFields.flatMap((f): ListingLink[] => {
    if (f.type !== 'url') return []
    const raw = place.details[f.key]
    const url = typeof raw === 'string' ? raw.trim() : ''
    if (!/^https?:\/\//i.test(url) || !hostOf(url)) return []
    if (read.some((w) => samePage(w.url, url))) return []
    // Its own watch on the page, less a search left on the link (a
    // hospital's Refuah link carries `?q=` its watch doesn't).
    if (read.some((w) => w.resourceId === place.id && samePage(pathOf(w.url), pathOf(url)))) return []
    const website = f.label.trim().toLowerCase() === 'website'
    if (website && (google.includes('website') || ownHosts.has(hostOf(url)))) return []
    return [{ resourceId: place.id, key: f.key, field: f.label, url }]
  })
}

/** How a link answered:
 *   opens      it answered: a page, or a site that turns robots away
 *              (401, 403, 429), which a person still gets through
 *   gone       the site says the page isn't there (404, 410)
 *   no_site    its site doesn't exist any more (no such address)
 *   no_answer  it timed out, couldn't be reached, or answered with an
 *              error of its own (5xx): maybe for now */
export type LinkAnswer = 'opens' | 'gone' | 'no_site' | 'no_answer'

export function answerOf(status: number): LinkAnswer {
  if (status === 404 || status === 410) return 'gone'
  if (status >= 500) return 'no_answer'
  return 'opens'
}

/** What a record says, kept in its lastError. */
export const ANSWER_TEXT: Record<Exclude<LinkAnswer, 'opens'>, string> = {
  gone: 'Not found',
  no_site: 'No such site',
  no_answer: 'Didn’t answer',
}

/** Its record after a check `at`: what to save. */
export function checkedRecord(prev: Pick<Watch, 'failingSince' | 'lastError' | 'pageHash'> | null, url: string, answer: LinkAnswer, at: string): Pick<Watch, 'lastRunAt' | 'lastError' | 'failingSince' | 'pageHash'> & Partial<Pick<Watch, 'lastOkAt'>> {
  if (answer === 'opens') return { lastRunAt: at, lastOkAt: at, lastError: null, failingSince: null, pageHash: url }
  // The same link not opening again keeps the day it first didn't.
  const since = prev?.failingSince && prev.pageHash === url ? prev.failingSince : at
  return { lastRunAt: at, lastError: ANSWER_TEXT[answer], failingSince: since, pageHash: url }
}

/** A link and its last check, as the Watches tab gets it. */
export type LinkStanding = ListingLink & {
  place: string
  category: string
  /** Its listing on the site. */
  href: string
  /** Its record; null before its first check. */
  id: string | null
  checkedAt: string | null
  /** What it said when it didn't open, and since when. */
  error: string | null
  failingSince: string | null
}

/** A link's standing from its record, if it checked this link. */
export function standingOf(link: ListingLink & { place: string; category: string; href: string }, record: Watch | undefined): LinkStanding {
  const mine = record && record.pageHash === link.url ? record : null
  return { ...link, id: record?.id ?? null, checkedAt: mine?.lastRunAt ?? null, error: mine?.lastError ?? null, failingSince: mine?.failingSince ?? null }
}

const WEEK_MS = 7 * 86_400_000

/** Doesn't open: gone, or no such site, at once; not answering, on two
 *  checks a week apart (the last one at least six days after the first
 *  that failed), so a site down for an afternoon isn't a problem. */
export function linkBroken(l: Pick<LinkStanding, 'error' | 'failingSince' | 'checkedAt'>): boolean {
  if (!l.failingSince) return false
  if (l.error !== ANSWER_TEXT.no_answer) return true
  return !!l.checkedAt && Date.parse(l.checkedAt) - Date.parse(l.failingSince) >= WEEK_MS - 86_400_000
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })

/** Its line: "Opens · checked Oct 19", "Not found since Oct 12", "Not
 *  checked yet". */
export function linkStatus(l: Pick<LinkStanding, 'error' | 'failingSince' | 'checkedAt'>): { text: string; bad: boolean } {
  if (l.failingSince && l.error) return { text: `${l.error} since ${day(l.failingSince)}`, bad: linkBroken(l) }
  if (l.checkedAt) return { text: `Opens · checked ${day(l.checkedAt)}`, bad: false }
  return { text: 'Not checked yet', bad: false }
}
