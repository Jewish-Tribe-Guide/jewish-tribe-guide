import { MENU_WATCH_CREATOR, type Watch } from './watches'
import { isMekorList } from './mekorWatch'
import { refuahHospitalId } from './refuahWatch'
import { isEruvWebsiteWatch } from './eruvWebsite'
import { isListingPageWatch } from './listingPageWatch'
import { isNewsletterWatch } from './newsletter'

// ── The order the nightly run checks the watches in (Oct 24) ────────────────
// They used to run in the order they were added, inside a minute, so on
// Oct 24 the run stopped after the first 29 of 107 every morning and the
// newest never ran at all. Now, when there's time for them all, the order
// doesn't matter; when there isn't, the most important go first, and any
// watch that missed a night goes ahead of everything, so a slow night only
// delays the least important rather than dropping them for good.

/** Most important first: a lost hechsher is the costliest mistake, then
 *  what a patient needs, then Shabbos, then times and hours. Menus are
 *  last: the slowest (the AI reads them) and the least urgent. */
export const WATCH_PRIORITY = ['kosher', 'hospital', 'eruv', 'times', 'website', 'menu'] as const
export type WatchPriority = (typeof WATCH_PRIORITY)[number]

export function watchPriority(w: Pick<Watch, 'kind' | 'url' | 'createdBy'>): WatchPriority {
  if (w.kind === 'keystone_list' || isMekorList(w.url)) return 'kosher'
  if (refuahHospitalId(w.url)) return 'hospital'
  if (isEruvWebsiteWatch(w)) return 'eruv'
  if (isListingPageWatch(w) || isNewsletterWatch({ createdBy: w.createdBy, url: w.url })) return 'times'
  if (w.createdBy === MENU_WATCH_CREATOR) return 'menu'
  return 'website'
}

/** Missed a night: not checked for a day and a half. A clean 48 hours
 *  would miss it, since Vercel starts the cron any time in its hour, so
 *  two nights apart can be 47 hours. */
export const OVERDUE_AFTER_MS = 36 * 3_600_000

/** The active watches, in the order the night's run checks them: any that
 *  missed a night (or never ran) first, then by priority, and the one
 *  checked longest ago first within each. */
export function orderForRun<W extends Pick<Watch, 'active' | 'kind' | 'url' | 'createdBy' | 'lastRunAt'>>(watches: readonly W[], now: number): W[] {
  const ran = (w: W) => (w.lastRunAt ? Date.parse(w.lastRunAt) : 0)
  const overdue = (w: W) => now - ran(w) > OVERDUE_AFTER_MS
  const rank = (w: W) => WATCH_PRIORITY.indexOf(watchPriority(w))
  return watches
    .filter((w) => w.active)
    .map((w) => ({ w, overdue: overdue(w), rank: rank(w), ran: ran(w) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.rank - b.rank || a.ran - b.ran)
    .map((x) => x.w)
}
