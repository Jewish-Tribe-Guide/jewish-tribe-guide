// ─────────────────────────────────────────────────────────────────────────────
// The Watches tab's groups (Oct 18). One long list stopped being scannable
// once every food place's menu and every shul's newsletter got a watch, so
// the tab groups them by what reads them, in a fixed order, and within a
// group puts what needs the admin first so a broken watch can't hide in a
// closed group of seventeen menus.
//
// Pure: WatchesManager renders it.
// ─────────────────────────────────────────────────────────────────────────────

import { MENU_WATCH_CREATOR, watchHealth, type Watch } from './watches'
import { isIgnoredSender, isNewsletterWatch } from './newsletter'
import { refuahHospitalId } from './refuahWatch'
import { isMekorList } from './mekorWatch'

export type WatchGroupKey = 'kosher' | 'newsletters' | 'hospitals' | 'menus' | 'pages'

const GROUPS: { key: WatchGroupKey; label: string }[] = [
  { key: 'kosher', label: 'Kosher lists' },
  { key: 'newsletters', label: 'Shul newsletters' },
  { key: 'hospitals', label: 'Hospitals on Refuah' },
  { key: 'menus', label: 'Menus' },
  { key: 'pages', label: 'Other pages' },
]

export function watchGroupOf(w: Watch): WatchGroupKey {
  if (isNewsletterWatch(w) || isIgnoredSender(w)) return 'newsletters'
  if (w.kind === 'keystone_list' || isMekorList(w.url)) return 'kosher'
  if (refuahHospitalId(w.url)) return 'hospitals'
  if (w.createdBy === MENU_WATCH_CREATOR) return 'menus'
  return 'pages'
}

/** Sort order within a group: 0 needs a look (not working, or a newsletter
 *  sender to link), 1 paused, 2 everything else, 3 a sender marked not a
 *  shul. */
export type WatchRank = 0 | 1 | 2 | 3

export type WatchRow = {
  watch: Watch
  rank: WatchRank
  needsLook: boolean
  /** Acted on this visit: shown even in a closed group. */
  keepShown: boolean
}

export type WatchGroup = {
  key: WatchGroupKey
  label: string
  rows: WatchRow[]
  counts: { toLink: number; notWorking: number; paused: number }
}

function displayName(w: Watch): string {
  return (w.label || w.url.replace(/^mailto:/i, '').replace(/^https?:\/\/(www\.)?/i, '')).toLowerCase()
}

/**
 * The tab's groups, empty ones left out. `kept` is the rank each row the
 * admin has acted on had when they acted, so linking or pausing one doesn't
 * move it.
 */
export function groupWatches(watches: Watch[], now: number, kept: ReadonlyMap<string, WatchRank> = new Map()): WatchGroup[] {
  const byKey = new Map<WatchGroupKey, WatchRow[]>()
  const counts = new Map<WatchGroupKey, WatchGroup['counts']>()
  for (const watch of watches) {
    const key = watchGroupOf(watch)
    const c = counts.get(key) ?? { toLink: 0, notWorking: 0, paused: 0 }
    counts.set(key, c)
    let rank: WatchRank
    if (isIgnoredSender(watch)) rank = 3
    else if (isNewsletterWatch(watch) && !watch.resourceId) {
      c.toLink++
      rank = 0
    } else {
      const state = watchHealth(watch, now).state
      if (state === 'failing' || state === 'stale') {
        c.notWorking++
        rank = 0
      } else if (state === 'paused') {
        c.paused++
        rank = 1
      } else rank = 2
    }
    const needsLook = rank === 0
    const keptRank = kept.get(watch.id)
    const row: WatchRow = { watch, rank: keptRank ?? rank, needsLook, keepShown: keptRank !== undefined }
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }
  return GROUPS.filter((g) => byKey.has(g.key)).map((g) => ({
    ...g,
    rows: byKey.get(g.key)!.sort((a, b) => a.rank - b.rank || displayName(a.watch).localeCompare(displayName(b.watch))),
    counts: counts.get(g.key)!,
  }))
}
