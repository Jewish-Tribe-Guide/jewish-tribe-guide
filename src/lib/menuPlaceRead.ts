import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { normalizeRow } from '@/lib/resourceStore'
import { itemsField } from '@/lib/listingView'
import { itemMarks, itemWording } from '@/lib/itemMarks'
import { findMenus, readMenuPage, readMenus, unreadMenuNote, menuPages, type Trouble } from '@/lib/menuReader'
import { MENU_LINK_KEY, menuWebsite, readMenuLink } from '@/lib/menuLink'
import { listMenuReadings, saveMenuReading, type StoredMenuReading } from '@/lib/menuReadingStore'
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

/** Never read, with something to read it from, and no dishes from a menu
 *  someone sent through the site (watchJobs.ts's 'not_read'). */
export function needsFirstRead(item: DirectoryResource, kind: DishKind, read: boolean): boolean {
  return !read && !!(menuLinkOf(item) || menuWebsite(item, kind.category)) && !newestMenuDate(item, kind.field)
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

/** Food places a morning run reads, at most. */
export const FIRST_READS_PER_RUN = 5

/** No read is started after this long into a run: each is a page or a
 *  few, maybe drawn in a browser, then the AI, inside the run's minute. */
export const FIRST_READS_FOR_MS = 30_000

/** Every community's food places never read (needsFirstRead), read and
 *  kept, a few a run, one after another. A place whose read throws is
 *  left for the next run. Returns what it did, for the run's log. */
export async function readUnreadMenus(
  apiKey: string,
  { perRun = FIRST_READS_PER_RUN, forMs = FIRST_READS_FOR_MS, now = Date.now }: { perRun?: number; forMs?: number; now?: () => number } = {},
): Promise<{ community: string; read: number; left: number }[]> {
  const until = now() + forMs
  const supabase = getAdminClient()
  const { data: communities, error } = await supabase.from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out = []
  let budget = perRun
  for (const { slug } of (communities ?? []) as { slug: string }[]) {
    const kinds = dishKinds(await listCategoriesUncached(slug))
    if (!kinds.length) continue
    const { readings, available } = await listMenuReadings(slug)
    if (!available) continue
    const { data: rows, error: listError } = await supabase
      .from('resource')
      .select('*')
      .eq('community_id', slug)
      .eq('status', 'approved')
      .in(
        'category',
        kinds.map((k) => k.category.id),
      )
    if (listError) throw new Error(`Couldn’t list the food places: ${listError.message}`)
    const read = new Set(readings.map((r) => r.resourceId))
    const unread = ((rows ?? []) as ResourceRow[])
      .map(normalizeRow)
      .flatMap((l) => {
        const kind = kinds.find((k) => k.category.id === l.category)
        return kind && needsFirstRead(l, kind, read.has(l.id)) ? [{ l, kind }] : []
      })
      .sort((a, b) => a.l.name.localeCompare(b.l.name))
    let done = 0
    for (const { l, kind } of unread) {
      if (budget <= 0 || now() > until) break
      budget--
      const kept = await readPlaceMenu(slug, l, kind, apiKey).catch((err) => {
        console.error(`[read-menus] ${l.name} failed:`, err)
        return null
      })
      if (kept) done++
    }
    out.push({ community: slug, read: done, left: unread.length - done })
  }
  return out
}
