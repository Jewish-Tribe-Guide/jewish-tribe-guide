// ─────────────────────────────────────────────────────────────────────────────
// What a watch keeps current (the user, Oct 19: "something that allows us to
// add url or email and then another to state what we're adding for"). The
// Watches tab adds by these and lists by these, in the same words, so a new
// watch lands where the admin expects. Before, one form guessed the reader
// from the address and a tick box, and the list was grouped by reader.
//
// An eruv's status isn't a `watch` row: its source is its status page or
// status email on the eruv itself (eruvStore.ts). The tab adds and lists it
// with the rest all the same. Menus aren't added here: the daily run gives
// every place with a menu link its own (menuWatch.ts).
//
// A shul's times are one choice, read from its website or its newsletter
// (the user, Oct 20: "one Shul's times choice, website or email"). Before,
// usual times (a page) and weekly times (an email) were two.
//
// Pure: WatchesManager and /api/admin/watches share it.
// ─────────────────────────────────────────────────────────────────────────────

import { senderAddress } from './newsletter'

export type WatchPurpose = 'eruv' | 'times' | 'hours' | 'kosher' | 'menu' | 'hospital' | 'other'

/** What a listing's page can be read for (listingPageWatch.ts pageReadsFor). */
export type ListingReads = 'times' | 'hours' | null

export type PurposeInfo = {
  key: WatchPurpose
  label: string
  /** Offered in "Add a watch". */
  addable: boolean
  /** What it's added for: a listing, an eruv, or nothing. */
  place: 'listing' | 'eruv' | null
  /** Only listings whose page reads this. */
  placeReads?: Exclude<ListingReads, null>
  /** Where it's read from. */
  source: 'page' | 'either'
}

export const WATCH_PURPOSES: readonly PurposeInfo[] = [
  { key: 'eruv', label: 'Eruv status', addable: true, place: 'eruv', source: 'either' },
  { key: 'times', label: 'Shul’s times', addable: true, place: 'listing', placeReads: 'times', source: 'either' },
  { key: 'hours', label: 'Hours', addable: true, place: 'listing', placeReads: 'hours', source: 'page' },
  { key: 'kosher', label: 'Kosher list', addable: true, place: null, source: 'page' },
  { key: 'menu', label: 'Menu', addable: false, place: 'listing', source: 'page' },
  { key: 'hospital', label: 'Hospital contacts', addable: true, place: 'listing', source: 'page' },
  { key: 'other', label: 'Anything else', addable: true, place: null, source: 'page' },
]

export function purposeInfo(key: WatchPurpose): PurposeInfo {
  return WATCH_PURPOSES.find((p) => p.key === key)!
}

export function isWatchPurpose(v: unknown): v is WatchPurpose {
  return WATCH_PURPOSES.some((p) => p.key === v)
}

/** An email address typed for a source, or a web address: which one. */
export function sourceKind(raw: string): 'email' | 'page' | null {
  const t = raw.trim()
  if (!t) return null
  if (!/^https?:/i.test(t) && senderAddress(t)) return 'email'
  return /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t) && !/^https?:\/\//i.test(t) ? null : 'page'
}

/** What's wrong with this source for this purpose, in the admin's words, or
 *  null. The server checks more (the page loads, the listing is real). */
export function sourceProblem(purpose: WatchPurpose, raw: string): string | null {
  const kind = sourceKind(raw)
  if (!kind) return 'Give a web address, or an email address.'
  if (purposeInfo(purpose).source === 'page' && kind === 'email') return 'Give the web address of the page. Only a shul’s times and an eruv’s status are read from email.'
  return null
}
