import { createHash } from 'node:crypto'
import { selectValues, type CategoryConfig } from './categories'
import { itemsField } from './listingView'
import { keepsMenuLink, MENU_LINK_KEY, readMenuLink } from './menuLink'
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
// Pure: no database, no network.

/** The AI reads per daily run at most: each takes several seconds, and the
 *  run has a minute. A changed menu over the limit keeps its old
 *  fingerprint, so it's read the next morning. */
export const MENU_AI_READS_PER_RUN = 3

export type WantedMenuWatch = { url: string; resourceId: string; label: string }

export function menuWatchLabel(name: string): string {
  return `Menu · ${name}`
}

/** The menu watches a community should have: one per approved food place
 *  with a menu link, but an ordering app's, which is never fetched. */
export function wantedMenuWatches(categories: CategoryConfig[], listings: DirectoryResource[]): WantedMenuWatch[] {
  const menus = new Set(categories.filter(keepsMenuLink).map((c) => c.id))
  const out: WantedMenuWatch[] = []
  const seen = new Set<string>()
  for (const l of listings) {
    if (!menus.has(l.category)) continue
    const url = readMenuLink(l[MENU_LINK_KEY])
    // One watch per page: two branches sharing a menu share its watch.
    if (!url || isOrderingApp(url) || seen.has(url)) continue
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
    .update(source.text ? source.text.replace(/\s+/g, ' ').trim() : (source.pdf ?? ''))
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

/** The reading's note on the Main dishes tab. */
export function changedMenuNote(found: MenuDish[]): string {
  const names = found.map((d) => d.name)
  return `Its menu changed. ${names.length === 1 ? 'One dish isn’t' : `${names.length} dishes aren’t`} on the listing yet: ${names.join(', ')}.`
}
