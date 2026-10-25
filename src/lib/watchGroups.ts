// ─────────────────────────────────────────────────────────────────────────────
// What a watch keeps current (Oct 19, watchPurposes.ts), rather than what
// reads it. A listing's own page goes with times or hours by what its
// listing has. The Watches tab's list grouped by it until Oct 25; What's
// tracked (nightKinds.ts) sorts by it now.
// ─────────────────────────────────────────────────────────────────────────────

import { MENU_WATCH_CREATOR, type Watch } from './watches'
import { isIgnoredSender, isNewsletterWatch } from './newsletter'
import { refuahHospitalId } from './refuahWatch'
import { isMekorList } from './mekorWatch'
import { isListingPageWatch } from './listingPageWatch'
import type { ListingReads, WatchPurpose } from './watchPurposes'

export type WatchGroupKey = Exclude<WatchPurpose, 'eruv'>

/** What a listing's page is read for, by its id. */
export type ReadsOf = (resourceId: string) => ListingReads

export function watchGroupOf(w: Watch, readsOf: ReadsOf = () => null): WatchGroupKey {
  if (isNewsletterWatch(w) || isIgnoredSender(w)) return 'times'
  if (w.kind === 'keystone_list' || isMekorList(w.url)) return 'kosher'
  if (refuahHospitalId(w.url)) return 'hospital'
  if (w.createdBy === MENU_WATCH_CREATOR) return 'menu'
  if (isListingPageWatch(w)) {
    // Its listing gone or unknown: its label still says (listingPageLabel).
    const reads = w.resourceId ? readsOf(w.resourceId) : null
    return reads === 'hours' || (!reads && / hours on their website$/.test(w.label ?? '')) ? 'hours' : 'times'
  }
  return 'other'
}
