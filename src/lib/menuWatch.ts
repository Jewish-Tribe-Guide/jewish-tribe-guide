import { createHash } from 'node:crypto'
import { selectValues, type CategoryConfig } from './categories'
import { itemsField } from './listingView'
import { keepsMenuLink, MENU_LINK_KEY, menuWebsite, readElsewhere, readMenuLink } from './menuLink'
import { isOrderingApp, type MenuDish, type MenuSource } from './menuReader'
import { MENU_WATCH_CREATOR } from './watches'
import type { DirectoryResource } from '@/types'

export { MENU_WATCH_CREATOR }

// ── Watching each food place's menu (the user, Oct 17) ──────────────────────
// Every food place with a menu link (menuLink.ts) has a watch of its own,
// made and kept by the daily run (menuWatchRun.ts): the page is read every
// morning, which costs nothing, and its words fingerprinted. Only when they
// change does the AI read it (menuReader.ts), and only dishes the listing
// doesn't have yet are worth an admin's look: those wait on the Main dishes
// tab as a reading, never on the listing. A dish missing from the reading
// says nothing (the AI picks ten at most), so nothing is ever taken off.
//
// The first read only sets the fingerprint: a menu nobody's seen change
// isn't news.
//
// The page watched is the place's menu link, which approving a reading on
// the Main dishes tab sets to the page it was read from; or else, for a
// place with none yet, the page its latest reading found the menu on
// (the user, Oct 21), when dishes were read there and it's on the place's
// own website (or is a PDF, which a site often keeps elsewhere). When the
// page stops opening, the run searches the website again (menuWatchRun.ts):
// a menu found on another page waits on the Main dishes tab, and approving
// it makes that page the menu link, and the watch follows. A person moves
// it, never the run on its own.
//
// Pure: no database, no network.

/** The AI reads per daily run at most: each takes several seconds, and the
 *  run has a minute. A changed menu over the limit keeps its old
 *  fingerprint, so it's read the next morning. */
export const MENU_AI_READS_PER_RUN = 3

export type WantedMenuWatch = { url: string; resourceId: string; label: string }

export function menuWatchLabel(name: string): string {
  return `Menu · ${name}`
}

/** What wantedMenuWatches needs of a place's latest menu reading. */
export type FoundReading = { resourceId: string; status: string; sourceUrl: string | null; dishes: readonly MenuDish[] }

/** A menu link that can be watched: an ordering app's is never fetched. */
export function watchableMenuLink(listing: DirectoryResource): string | null {
  const url = readMenuLink(listing[MENU_LINK_KEY])
  return url && !isOrderingApp(url) ? url : null
}

/** The page the reader found a place's menu on, when it's one to watch:
 *  dishes were read from it (not from photos, not a failed read or "no
 *  menu"), and it's on the place's own website. */
export function foundMenuPage(listing: DirectoryResource, category: CategoryConfig, reading: FoundReading | undefined): string | null {
  const url = reading?.sourceUrl
  if (!reading || !url || reading.status === 'failed' || reading.dishes.length === 0) return null
  if (!/^https?:\/\//i.test(url) || isOrderingApp(url)) return null
  const website = menuWebsite(listing, category)
  return website && !readElsewhere(url, website, null) ? url : null
}

/** The menu watches a community should have: one per approved food place,
 *  on its menu link, or else on the page the reader found its menu on. */
export function wantedMenuWatches(categories: CategoryConfig[], listings: DirectoryResource[], readings: readonly FoundReading[] = []): WantedMenuWatch[] {
  const menus = new Map(categories.filter(keepsMenuLink).map((c) => [c.id, c]))
  const byPlace = new Map(readings.map((r) => [r.resourceId, r]))
  const out: WantedMenuWatch[] = []
  const seen = new Set<string>()
  for (const l of listings) {
    const category = menus.get(l.category)
    if (!category) continue
    const url = watchableMenuLink(l) ?? foundMenuPage(l, category, byPlace.get(l.id))
    // One watch per page: two branches sharing a menu share its watch.
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, resourceId: l.id, label: menuWatchLabel(l.name) })
  }
  return out
}

/** What to add and what to take away, of the run's own menu watches. */
export function menuWatchChanges(
  wanted: WantedMenuWatch[],
  existing: { id: string; url: string; resourceId: string | null; createdBy: string | null }[],
): { add: WantedMenuWatch[]; remove: string[] } {
  const watched = new Set(existing.map((w) => w.url))
  const want = new Set(wanted.map((w) => `${w.resourceId} ${w.url}`))
  return {
    add: wanted.filter((w) => !watched.has(w.url)),
    remove: existing.filter((w) => w.createdBy === MENU_WATCH_CREATOR && !want.has(`${w.resourceId} ${w.url}`)).map((w) => w.id),
  }
}

/** A menu's fingerprint: its words (or a PDF's bytes), so a page that only
 *  changed its markup isn't a change. */
export function menuHash(source: MenuSource): string {
  return createHash('sha256')
    // A menu that is only pictures: their addresses, which change when one is replaced.
    .update(source.text ? source.text.replace(/\s+/g, ' ').trim() : (source.pdf ?? (source.pictures ?? []).join('\n')))
    .digest('hex')
}

/** The listing's dishes now, always and not always. */
export function listedDishes(listing: DirectoryResource, category: CategoryConfig): string[] {
  const field = itemsField(category)
  if (!field) return []
  return [...selectValues(listing[field.key]), ...selectValues(listing[`${field.key}_sometimes`])]
}

/** The dishes a reading found that the listing doesn't have. */
export function newDishes(read: MenuDish[], listed: string[]): MenuDish[] {
  const have = new Set(listed.map((d) => d.trim().toLowerCase()))
  return read.filter((d) => !have.has(d.name.trim().toLowerCase()))
}

function dishDifferences(found: MenuDish[], missing: readonly string[]): string {
  const names = found.map((d) => d.name)
  const added = names.length ? ` ${names.length === 1 ? 'One dish isn’t' : `${names.length} dishes aren’t`} on the listing yet: ${names.join(', ')}.` : ''
  const gone = missing.length ? ` ${missing.length === 1 ? 'One listed dish isn’t' : `${missing.length} listed dishes aren’t`} on it any more: ${missing.join(', ')}.` : ''
  return `${added}${gone}`
}

/** The reading's note on the Main dishes tab. */
export function changedMenuNote(found: MenuDish[], missing: readonly string[] = []): string {
  return `Its menu changed.${dishDifferences(found, missing)}`
}

/** The note on a reading from the page a menu moved to. Approving it makes
 *  that page the menu link (setMenuDishes), so it says so. */
export function menuMovedNote(url: string, found: MenuDish[], missing: readonly string[] = []): string {
  return `Its menu page stopped opening, and the menu is now at ${url}. Approving makes that its menu link.${dishDifferences(found, missing)}`
}
