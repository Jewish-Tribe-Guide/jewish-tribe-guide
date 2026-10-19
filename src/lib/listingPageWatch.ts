import { createHash } from 'node:crypto'
import type { CategoryConfig } from './categories'
import type { FieldRead } from './fieldChanges'
import type { Proposal } from './messageReader'
import type { SubmissionSource } from './submissionSource'
import type { Watch } from './watches'

// ── Watching a listing's own web page (the user, Oct 19) ────────────────────
// A shul's page of its usual minyan times, or a mikvah's page of its hours,
// tied by an admin to the listing it keeps current, the way a Refuah page is
// tied to its hospital. Read every morning, as a menu is (menuWatch.ts): the
// page's words are fingerprinted, which costs nothing, and only when they
// change does the AI read it, with the cheapest model. What it read that
// differs from the listing goes to the moderation queue for an admin.
//
// Rules (Oct 19):
//   - Filed only when the page changes. A website is often behind the
//     shul's newsletter, so a standing difference is the newsletter being
//     newer, not news; the note says "From their website, changed <date>"
//     so the admin can weigh it.
//   - Never dates the listing when the page agrees with it. Unlike
//     Keystone-K, Mekor and Refuah (read by code, sourceConfirm.ts), this
//     page is read by the AI, and the AI reads but never confirms.
//   - The same suggestion is never filed twice, approved or rejected, and
//     a listing with a suggestion already in the queue is left until it's
//     settled.
//
// Pure: no database, no network. listingPageRun.ts reads and files.

/** The `created_by` of a listing-page watch, so the daily run reads it for
 *  the listing's times or hours, and the Watches tab groups it. */
export const LISTING_PAGE_WATCH_CREATOR = 'listing pages'

/** Who files its suggestions, as the queue says it. */
export const LISTING_PAGE_WATCH_NAME = 'Their website (automated)'

/** The longest page text the readers are given. */
export const MAX_PAGE_TEXT = 8_000

export function isListingPageWatch(w: Pick<Watch, 'createdBy'>): boolean {
  return w.createdBy === LISTING_PAGE_WATCH_CREATOR
}

/** What a listing's page is read for: a shul's usual minyan times, or the
 *  weekly hours fields (a mikvah's hours, women's hours, men's, keilim).
 *  Null when its category has neither, and the page has nothing to give. */
export type PageReads = { kind: 'times'; key: string } | { kind: 'hours'; keys: string[] }

export function pageReadsFor(category: Pick<CategoryConfig, 'detailFields'>): PageReads | null {
  const minyanim = category.detailFields.find((f) => f.type === 'minyanim')
  if (minyanim) return { kind: 'times', key: minyanim.key }
  const hours = category.detailFields.filter((f) => f.type === 'hours').map((f) => f.key)
  return hours.length ? { kind: 'hours', keys: hours } : null
}

export function listingPageLabel(name: string, reads: PageReads): string {
  return `${name} · ${reads.kind === 'times' ? 'davening times' : 'hours'} on their website`
}

/** The hours changes the message reader read for this listing, and only
 *  hours: a page's phone or address is for another day. A page that names
 *  no other place is about this one, so a proposal for no place counts. */
export function hoursReads(proposals: Proposal[], listingId: string, keys: readonly string[]): FieldRead[] {
  const wanted = new Set(keys)
  return proposals.flatMap((p) =>
    p.kind === 'fields' && (p.listingId === listingId || (p.listingId === null && !p.ask)) ? p.changes.filter((c) => wanted.has(c.key) && c.hours) : [],
  )
}

/** "Oct 20", the day the page was seen to change. */
export function changedOn(now: number, timeZone = 'America/New_York'): string {
  return new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
}

/** The suggestion's note: where it's from, when the page changed, and what
 *  it changes, a line each. */
export function listingPageNote(url: string, on: string, lines: readonly string[]): string {
  return [`From their website, changed ${on}: ${url}`, lines.join('\n')].join('\n\n')
}

/** Where it came from, for the queue's opened card: their own page, read by
 *  the AI, with its words beside the change. The listing is the authority
 *  on itself, as with a shul's newsletter (newsletterRun.ts), so an
 *  admin's approval dates it by name; agreement alone never does. */
export function listingPageSource(listingName: string, url: string, on: string, text: string | null): SubmissionSource {
  return {
    readBy: 'ai',
    from: `${listingName}’s website`,
    named: listingName,
    note: `From their website, changed ${on}: ${url}`,
    ...(text ? { original: text.slice(0, MAX_PAGE_TEXT) } : {}),
  }
}

/** A value with every `id` and `postedAt` taken out and lists put in one
 *  order, so the same times read twice (new ids, another order) are the
 *  same suggestion. An empty list is no list: a shul with no schedules. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? v.map(canonical).map((x) => JSON.stringify(x)).sort() : null
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k, x]) => k !== 'id' && k !== 'postedAt' && x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    )
  }
  return v ?? null
}

/** A suggestion's fingerprint: the fields it sets, as they'd be. */
export function suggestionKey(details: Record<string, unknown>, keys: readonly string[]): string {
  return createHash('sha256')
    .update(JSON.stringify(keys.map((k) => [k, canonical(details[k])])))
    .digest('hex')
}

/** Whether this watch filed these fields as they'd be before, whatever
 *  became of it: a rejected suggestion isn't made again until the page
 *  says something else. */
export function filedBefore(earlier: readonly { payload: unknown }[], details: Record<string, unknown>, keys: readonly string[]): boolean {
  const key = suggestionKey(details, keys)
  return earlier.some((s) => {
    const d = (s.payload as { details?: Record<string, unknown> } | null)?.details
    return !!d && suggestionKey(d, keys) === key
  })
}
