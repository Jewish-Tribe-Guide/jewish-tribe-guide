import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { normalizeRow } from '@/lib/resourceStore'
import { itemsField } from '@/lib/listingView'
import { itemMarks, itemWording } from '@/lib/itemMarks'
import { findMenus, readMenuPage, readMenus, unreadMenuNote, menuPages, type Trouble } from '@/lib/menuReader'
import { MENU_LINK_KEY, menuWebsite, readMenuLink } from '@/lib/menuLink'
import { dateMenuDishes, listMenuReadings, saveMenuReading, type StoredMenuReading } from '@/lib/menuReadingStore'
import { listedDishes, newDishes } from '@/lib/menuWatch'
import { pageRenderer } from '@/lib/renderPage'
import type { CategoryConfig, CategoryField } from '@/lib/categories'
import type { DirectoryResource, ResourceRow } from '@/types'

// A food place's own menu, read by the AI and kept as its reading
// (menu_reading) for the Main dishes page: by that page's "Read now", and
// every morning for the places never read (/api/cron/read-menus; the user,
// Oct 22: opening the page reads nothing). Server-only.

export type DishKind = { category: CategoryConfig; field: CategoryField }

/** The categories with a list of dishes, each with that list's field. */
export function dishKinds(categories: CategoryConfig[]): DishKind[] {
  return categories.flatMap((c) => {
    const field = itemsField(c)
    return field && itemWording(field).noun === 'dish' ? [{ category: c, field }] : []
  })
}

/** A place's menu link, when it has one (menuLink.ts). */
export function menuLinkOf(item: DirectoryResource): string | null {
  return readMenuLink(item[MENU_LINK_KEY]) || null
}

/** The dishes a place lists now: each looked for again on a new read of
 *  its menu (the user, Oct 21), the ones added by hand included. */
export function listedNames(item: DirectoryResource, field: CategoryField): string[] {
  return itemMarks(item, field).map((m) => m.name)
}

/** The newest "on its menu" date among the dishes a place lists. */
export function newestMenuDate(item: DirectoryResource, field: CategoryField): string | null {
  return itemMarks(item, field).reduce<string | null>((newest, m) => (m.menuAt && (!newest || m.menuAt > newest) ? m.menuAt : newest), null)
}

/** Never read, with something to read it from. Its dishes dated "on its
 *  menu" too: until Oct 26 those were left out, as from a menu sent through
 *  the site, but most were dated by the reads of Oct 17 and 18, before a
 *  reading was kept, so with no reading and no menu link they had no watch
 *  either, and HipCityVeg's dishes said Oct 17 for good. */
export function needsFirstRead(item: DirectoryResource, kind: DishKind, read: boolean): boolean {
  return !read && !!(menuLinkOf(item) || menuWebsite(item, kind.category))
}

/** Reads a place's menu now and keeps what the AI proposed: its menu link
 *  when that can be read, else the pages its website links to as its menu,
 *  best first, until one names dishes. A page drawn by a script is drawn
 *  in a browser (renderPage.ts). None read is kept too, saying why. */
export async function readPlaceMenu(slug: string, listing: DirectoryResource, kind: DishKind, apiKey: string): Promise<StoredMenuReading | null> {
  const website = menuWebsite(listing, kind.category)
  const menuUrl = menuLinkOf(listing)
  // Why each couldn't be read, the first reason each, for the note.
  const renderer = pageRenderer()
  const trouble: { link?: Trouble; site?: Trouble } = {}
  let sources
  try {
    const linked = menuUrl ? await readMenuPage(menuUrl, { render: renderer.render, trouble: (t) => void (trouble.link ??= t) }) : null
    sources = linked
      ? menuPages(linked, website ? await findMenus(website, { render: renderer.render }).catch(() => []) : [])
      : website
        ? await findMenus(website, { render: renderer.render, trouble: (t) => void (trouble.site ??= t) })
        : []
  } finally {
    await renderer.close()
  }
  if (!sources.length) {
    return saveMenuReading(slug, listing.id, {
      status: 'failed',
      sourceUrl: menuUrl ?? website,
      dishes: [],
      note: unreadMenuNote(menuUrl, website, trouble),
      model: null,
    })
  }
  const read = (await readMenus(sources, listing.name, { apiKey, listed: listedNames(listing, kind.field) }))!
  return saveMenuReading(slug, listing.id, {
    status: read.dishes.length ? 'proposed' : 'failed',
    sourceUrl: read.sourceUrl,
    dishes: read.dishes,
    missing: read.missing,
    note: read.note,
    model: read.model,
  })
}

/** A first read that agrees with the listing (no dish new to it, none it
 *  lists missing) dates every dish it named, as a menu watch's agreeing
 *  read does (menuWatchRun.ts); one that doesn't waits on the Main dishes
 *  tab, its dates as they were. */
async function dateIfAgreeing(slug: string, listing: DirectoryResource, kind: DishKind, kept: StoredMenuReading): Promise<void> {
  if (kept.status !== 'proposed' || kept.missing?.length) return
  if (newDishes(kept.dishes, listedDishes(listing, kind.category)).length) return
  await dateMenuDishes(slug, listing.id, kind.field.key, kept.dishes.map((d) => d.name))
}

/** Food places a morning run reads, at most. 5 in a minute's run got
 *  through two or three: 18 waited on Oct 26, when places whose dishes
 *  were dated before readings were kept joined them. */
export const FIRST_READS_PER_RUN = 20

/** No read is started after this long into a run: each is a page or a
 *  few, maybe drawn in a browser, then the AI, inside the run's five
 *  minutes (read-menus' maxDuration). */
export const FIRST_READS_FOR_MS = 200_000

/** How long one place's read may take. Oct 27, Center City Pretzel Co.'s
 *  never came back: the run was stopped at its five minutes, kept no
 *  record, and the 16 after it by name waited behind it every morning. */
export const FIRST_READ_MS = 90_000

/** The run is done by now, whatever it's reading, so it ends inside its
 *  five minutes and records what it did. */
export const FIRST_READS_END_MS = 270_000

const TOO_LONG = Symbol('too long')
/** `work`, or TOO_LONG once `ms` pass; the read is left behind. */
function within<T>(ms: number, work: Promise<T>): Promise<T | typeof TOO_LONG> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<typeof TOO_LONG>((resolve) => (timer = setTimeout(() => resolve(TOO_LONG), Math.max(0, ms))))
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** A community's food places never read (needsFirstRead), by name. */
async function unreadMenus(slug: string): Promise<{ l: DirectoryResource; kind: DishKind }[]> {
  const kinds = dishKinds(await listCategoriesUncached(slug))
  if (!kinds.length) return []
  const { readings, available } = await listMenuReadings(slug)
  if (!available) return []
  const { data: rows, error } = await getAdminClient()
    .from('resource')
    .select('*')
    .eq('community_id', slug)
    .eq('status', 'approved')
    .in(
      'category',
      kinds.map((k) => k.category.id),
    )
  if (error) throw new Error(`Couldn’t list the food places: ${error.message}`)
  const read = new Set(readings.map((r) => r.resourceId))
  return ((rows ?? []) as ResourceRow[])
    .map(normalizeRow)
    .flatMap((l) => {
      const kind = kinds.find((k) => k.category.id === l.category)
      return kind && needsFirstRead(l, kind, read.has(l.id)) ? [{ l, kind }] : []
    })
    .sort((a, b) => a.l.name.localeCompare(b.l.name))
}

/** The food places whose menu was never read, for the Watches tab's
 *  Menus line (nightKinds.ts). */
export async function listUnreadMenus(slug: string): Promise<{ id: string; name: string }[]> {
  return (await unreadMenus(slug)).map(({ l }) => ({ id: l.id, name: l.name }))
}

/** Every community's food places never read, read and kept, a few a run,
 *  one after another. A place whose read throws is left for the next run.
 *  Returns what it did, for the run's log. */
export async function readUnreadMenus(
  apiKey: string,
  {
    perRun = FIRST_READS_PER_RUN,
    forMs = FIRST_READS_FOR_MS,
    readMs = FIRST_READ_MS,
    endMs = FIRST_READS_END_MS,
    now = Date.now,
  }: { perRun?: number; forMs?: number; readMs?: number; endMs?: number; now?: () => number } = {},
): Promise<{ community: string; read: number; failed: number; left: number }[]> {
  const start = now()
  const until = start + forMs
  const end = start + endMs
  const { data: communities, error } = await getAdminClient().from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out = []
  let budget = perRun
  for (const { slug } of (communities ?? []) as { slug: string }[]) {
    const unread = await unreadMenus(slug)
    if (!unread.length) continue
    let done = 0
    let failed = 0
    for (const { l, kind } of unread) {
      if (budget <= 0 || now() > until) break
      budget--
      const read = await within(
        Math.min(readMs, end - now()),
        readPlaceMenu(slug, l, kind, apiKey).catch((err) => {
          console.error(`[read-menus] ${l.name} failed:`, err)
          return null
        }),
      )
      // Kept as not read, saying why, so it's on the Main dishes page with
      // Read now rather than first in line again tomorrow.
      const kept =
        read === TOO_LONG
          ? await saveMenuReading(slug, l.id, { status: 'failed', sourceUrl: menuLinkOf(l) ?? menuWebsite(l, kind.category), dishes: [], note: 'Its menu took too long to read.', model: null }).catch((err) => {
              console.error(`[read-menus] ${l.name} took too long, and couldn’t be kept:`, err)
              return null
            })
          : read
      // One that couldn't be read is kept, saying why, but isn't a read.
      if (kept?.status === 'failed') failed++
      else if (kept) done++
      if (kept) await dateIfAgreeing(slug, l, kind, kept)
    }
    out.push({ community: slug, read: done, failed, left: unread.length - done - failed })
  }
  return out
}
