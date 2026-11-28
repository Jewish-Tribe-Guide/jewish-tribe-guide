import { track } from '@vercel/analytics'

// Counting Add (docs/add-rethink.md, the plan's step 1; the user, Nov 28):
// how many open it and from where, which way each goes, and how many send.
// Vercel Analytics custom events, as the site's other counts are. Only the
// Add box (opened on Find the place) is counted; a listing's "Update …"
// is an update, not an Add.

/** Where Add was opened: a category page's, or the site's own "+" (any
 *  other screen). `searched`: from a search that ended at Add. */
export type AddFrom = 'category' | 'site'

/** Which way it went: a place the guide has (its edit), one from Google,
 *  filled in by hand, or a post or photo sent as it is. */
export type AddWay = 'place_we_have' | 'google' | 'by_hand' | 'post'

export function countAddOpened(from: AddFrom, searched: boolean): void {
  track('add_opened', { from, searched })
}

export function countAddWay(way: AddWay): void {
  track('add_way', { way })
}

export function countAddSent(way: AddWay): void {
  track('add_sent', { way })
}
