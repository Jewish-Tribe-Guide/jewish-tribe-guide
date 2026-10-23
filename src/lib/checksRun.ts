import type { CategoryConfig } from './categories'
import type { DirectoryResource } from '@/types'
import type { CheckKind } from './phoneHome'
import { MENU_WATCH_CREATOR, type Watch } from './watches'
import { isMekorList } from './mekorWatch'
import { refuahHospitalId } from './refuahWatch'
import { isEruvWebsiteWatch } from './eruvWebsite'
import { isNewsletterWatch } from './newsletter'
import { isListingPageWatch, pageReadsFor } from './listingPageWatch'
import { hoursSections } from './hoursSections'

// ── What the guide's checks read, by kind (the user, Oct 23) ────────────────
// The trust sheet names what the guide checked this week. Read off the
// listings alone (the box dates a check leaves, boxDates.ts), a check that
// ran and found a difference dated nothing, and went unnamed: the sheet
// said "Menus and eruv status" while every shul's page was read each
// morning. So the watches say it too: each kind of check, and when one of
// its pages was last read properly (lastOkAt). Only the kind and the time
// leave the server: no addresses, errors or names.
//
// Pure: no network, no database.

export type CheckRan = { kind: CheckKind; at: string }

type WatchFields = Pick<Watch, 'kind' | 'url' | 'resourceId' | 'createdBy'>

/** The kind of check a watch is, or null for one the sheet doesn't name (a
 *  plain website, a restaurant's own page for its hours). */
export function watchCheckKind(watch: WatchFields, category: Pick<CategoryConfig, 'detailFields'> | undefined): CheckKind | null {
  const w = { ...watch, createdBy: watch.createdBy ?? null }
  if (w.kind === 'keystone_list' || isMekorList(w.url)) return 'kosher'
  if (refuahHospitalId(w.url)) return 'hospitals'
  if (isEruvWebsiteWatch(w)) return 'eruv'
  if (w.createdBy === MENU_WATCH_CREATOR) return 'menus'
  if (isNewsletterWatch(w)) return w.resourceId ? 'times' : null
  if (!isListingPageWatch(w) || !category) return null
  const reads = pageReadsFor(category)
  if (reads?.kind === 'times') return 'times'
  // A mikvah's page: its hours are its sections' (women's, men's, keilim).
  if (reads?.kind === 'hours' && hoursSections(category, reads.keys).some((s) => s.section !== s.hours)) return 'mikvah'
  return null
}

/** Each kind of check, with when one of its pages was last read properly.
 *  A watch that's off, or has never read its page, claims nothing. */
export function checksRun(
  watches: readonly (WatchFields & Pick<Watch, 'active' | 'lastOkAt'>)[],
  listings: readonly Pick<DirectoryResource, 'id' | 'category'>[],
  categories: readonly CategoryConfig[],
): CheckRan[] {
  const categoryOf = new Map(listings.map((l) => [l.id, categories.find((c) => c.id === l.category)]))
  const latest = new Map<CheckKind, string>()
  for (const w of watches) {
    if (!w.active || !w.lastOkAt) continue
    const kind = watchCheckKind(w, w.resourceId ? categoryOf.get(w.resourceId) : undefined)
    if (!kind) continue
    const had = latest.get(kind)
    if (!had || Date.parse(w.lastOkAt) > Date.parse(had)) latest.set(kind, w.lastOkAt)
  }
  return [...latest].map(([kind, at]) => ({ kind, at }))
}
