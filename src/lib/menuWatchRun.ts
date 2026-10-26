import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { keepsMenuLink, menuWebsite, readElsewhere } from '@/lib/menuLink'
import { findMenus, isOrderingApp, menuPages, readMenu, readMenuPage, readMenus, troubleClause, type Render, type Trouble } from '@/lib/menuReader'
import { dateMenuDishes, getMenuReading, listMenuReadings, saveMenuReading } from '@/lib/menuReadingStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import {
  changedMenuNote,
  dishesToLookFor,
  listedDishes,
  menuHash,
  menuMovedNote,
  MENU_AI_READS_PER_RUN,
  MENU_WATCH_CREATOR,
  menuWatchChanges,
  newDishes,
  wantedMenuWatches,
} from '@/lib/menuWatch'
import { checkFrom, pageCheck } from '@/lib/listingPageWatch'
import { pageRenderer } from '@/lib/renderPage'
import { itemsField } from '@/lib/listingView'
import type { Watch, WatchCheck, WatchOutcome } from '@/lib/watches'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource, ResourceRow } from '@/types'

// The menu watches' database and network half (menuWatch.ts has the rules).
// Server-only.

/** How many AI reads this run has left: one object shared by a cron run's
 *  watches, the menus' and the shul and mikvah pages' (listingPageRun.ts)
 *  alike. A run without one ("Check now", one watch) isn't limited.
 *  `renders`: how many menu pages it may draw in a browser (renderPage.ts),
 *  each several seconds of a run that has a minute for every watch.
 *  `searches`: how many websites it may search again for a menu whose page
 *  stopped opening (a few pages each, and one of the run's AI reads). */
export type MenuReadBudget = { aiReads: number; renders?: number; searches?: number; compares?: number }

/** Listing pages a cron run may read again only because their listing
 *  changed (listingPageRun.ts), apart from the reads a page that changed
 *  gets, so they never crowd one out. */
export const LISTING_COMPARES_PER_RUN = 3

/** Menu pages a cron run may draw in a browser. */
export const MENU_RENDERS_PER_RUN = 1

/** Websites a cron run may search again. One left for want of budget fails
 *  as it did before, and is searched on a run with room. */
export const MENU_SEARCHES_PER_RUN = 1

export function newMenuReadBudget(): MenuReadBudget {
  return { aiReads: MENU_AI_READS_PER_RUN, renders: MENU_RENDERS_PER_RUN, searches: MENU_SEARCHES_PER_RUN, compares: LISTING_COMPARES_PER_RUN }
}

/** Gives every food place its menu watch, on its menu link or else the page
 *  its latest reading found the menu on (menuWatch.ts), and takes away the
 *  run's own watches on pages no place's menu is on any more. Never touches
 *  a watch an admin added. Returns what it did, for the run's log. */
export async function syncMenuWatches(): Promise<{ community: string; added: number; removed: number }[]> {
  const supabase = getAdminClient()
  const { data: communities, error } = await supabase.from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out = []
  for (const { slug } of (communities ?? []) as { slug: string }[]) {
    const categories = (await listCategoriesUncached(slug)).filter(keepsMenuLink)
    if (categories.length === 0) continue
    const { data: rows, error: listError } = await supabase
      .from('resource')
      .select('*')
      .eq('community_id', slug)
      .eq('status', 'approved')
      .in(
        'category',
        categories.map((c) => c.id),
      )
    if (listError) throw new Error(`Couldn’t list the food places: ${listError.message}`)
    const { watches, available } = await listWatches(slug)
    if (!available) continue
    // Before the menu_reading table exists, only menu links are watched.
    const { readings } = await listMenuReadings(slug)
    const wanted = wantedMenuWatches(categories, ((rows ?? []) as ResourceRow[]).map(normalizeRow), readings)
    const { add, remove } = menuWatchChanges(wanted, watches)
    let added = 0
    for (const w of add) {
      if (await addWatch(slug, { kind: 'website', url: w.url, resourceId: w.resourceId, label: w.label, createdBy: MENU_WATCH_CREATOR })) added++
    }
    for (const id of remove) await removeWatch(slug, id)
    out.push({ community: slug, added, removed: remove.length })
  }
  return out
}

/** One food place's menu: read it, and when its words changed, have the AI
 *  read it and keep for an admin any dishes the listing doesn't have, and
 *  any it has that the menu no longer names (the user, Oct 21).
 *  `full` is the admin's "Check now" (the user, Oct 20): the AI reads it
 *  changed or not, and the result says which dishes it read and which the
 *  listing lacks. A reading the Main dishes tab already has for those
 *  dishes, waiting or skipped, isn't made again. */
export async function runMenuWatch(
  watch: Pick<Watch, 'communityId' | 'url' | 'resourceId' | 'pageHash'>,
  budget?: MenuReadBudget,
  opts: { fetchImpl?: typeof fetch; apiKey?: string | undefined; full?: boolean; renderer?: ReturnType<typeof pageRenderer> | null } = {},
): Promise<WatchOutcome> {
  if (!watch.resourceId) return { ok: false, error: 'This menu watch isn’t tied to a listing' }
  const row = await getResourceRowById(watch.resourceId, watch.communityId)
  if (!row || row.status !== 'approved') return { ok: false, error: 'The place this menu belongs to isn’t in the guide any more' }
  const listing = normalizeRow(row)
  const category = (await listCategoriesUncached(watch.communityId)).find((c) => c.id === listing.category)
  if (!category || !keepsMenuLink(category)) return { ok: false, error: 'The place this menu belongs to has no list of dishes' }

  // A menu drawn by a script is drawn in a browser: always for "Check now",
  // within the run's budget for the daily run. One left undrawn for want
  // of budget isn't a failure: it's read on a run with room.
  let undrawn = false
  const renderer = opts.renderer === undefined ? pageRenderer() : opts.renderer
  const render: Render | null =
    renderer?.render
      ? async (url, trouble) => {
          if (budget && !opts.full) {
            if ((budget.renders ?? 0) <= 0) {
              undrawn = true
              return null
            }
            budget.renders!--
          }
          return renderer.render!(url, trouble)
        }
      : null
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  // Why it couldn't be read, the first reason, for the watch's error.
  const trouble: { t?: Trouble } = {}
  let source
  // What became of a search for where the menu is now, said after why.
  let afterwards = ''
  try {
    source = await readMenuPage(watch.url, { fetchImpl: opts.fetchImpl, render, trouble: (t) => void (trouble.t ??= t) })
    if (!source && !undrawn) afterwards = await lookElsewhere(watch, listing, category, budget, { apiKey, full: opts.full, fetchImpl: opts.fetchImpl, render })
  } finally {
    await renderer?.close()
  }
  if (!source && undrawn) return { ok: true, filed: 0 }
  if (!source) {
    return {
      ok: false,
      error: `${trouble.t ? `Couldn’t read the menu: ${troubleClause(trouble.t)}` : 'Couldn’t read the menu (blocked, moved, or built in the browser)'}${afterwards}`,
      ...(opts.full ? { check: { what: 'dishes', from: null, result: 'unreadable', read: [], differences: [], queue: null } as const } : {}),
    }
  }
  const pageHash = menuHash(source)
  const changed = !!watch.pageHash && watch.pageHash !== pageHash
  // The first read sets the baseline; an unchanged menu is left alone, but
  // still names the dishes it named, so their dates move (withMenuChecked):
  // not one the last read found missing from it, still waiting or skipped.
  const field = itemsField(category)
  // Unchanged, but with dishes its last read never looked for (added since,
  // by hand): read again for them, from the run's AI reads (the user, Oct 26).
  let lookingFor: string[] = []
  if (!opts.full && !changed) {
    const kept = watch.pageHash && field ? await getMenuReading(watch.communityId, listing.id) : null
    lookingFor = dishesToLookFor({ dishes: listedDishes(listing, category), menuDated: menuDated(listing) }, kept)
    if (!lookingFor.length) {
      if (watch.pageHash && field) {
        const missing = new Set((kept?.missing ?? []).map((n) => n.trim().toLowerCase()))
        await dateMenuDishes(watch.communityId, listing.id, field.key, menuDated(listing).filter((n) => !missing.has(n.trim().toLowerCase())))
      }
      return { ok: true, filed: 0, pageHash }
    }
  }

  // Changed (or looking for dishes). Without the AI, or with this run's
  // reads spent, the old fingerprint stays, so the change is still news
  // next time; dishes looked for are looked for on a run with room.
  if (!apiKey) {
    if (!opts.full) return { ok: true, filed: 0 }
    return { ok: true, filed: 0, check: { what: 'dishes', from: checkFrom(source), result: 'nothing', read: [], differences: [], queue: null, note: 'The AI isn’t set up here, so the menu wasn’t read.' } }
  }
  if (budget && !opts.full) {
    if (budget.aiReads <= 0) return { ok: true, filed: 0 }
    budget.aiReads--
  }
  const listed = listedDishes(listing, category)
  let read
  try {
    // With the rest of its menu on the website (menuPages), so a dish
    // from another page isn't "not on the menu"; each page an AI read.
    const website = menuWebsite(listing, category)
    const pages = menuPages(source, website ? await findMenus(website, { fetchImpl: opts.fetchImpl }).catch(() => []) : [])
    const reading = budget && !opts.full ? pages.slice(0, 1 + Math.max(0, budget.aiReads)) : pages
    if (budget && !opts.full) budget.aiReads -= reading.length - 1
    read = reading.length > 1 ? (await readMenus(reading, listing.name, { apiKey, fetchImpl: opts.fetchImpl, listed }))! : await readMenu(source, listing.name, { apiKey, fetchImpl: opts.fetchImpl, listed })
  } catch (err) {
    return { ok: false, error: `${changed ? 'The menu changed, and the AI' : 'The AI'} couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  const found = newDishes(read.dishes, listed)
  const missing = read.missing ?? []
  const check = (queue: WatchCheck['queue']) =>
    pageCheck('dishes', checkFrom(source, { pictures: read.fromPictures }), read.dishes.length ? [read.dishes.map((d) => d.name).join(', ')] : [], {
      differences: [
        ...(found.length ? [`Not on the listing: ${found.map((d) => d.name).join(', ')}`] : []),
        ...(missing.length ? [`Not on the menu: ${missing.join(', ')}`] : []),
      ],
      queue,
    })
  if (found.length === 0 && missing.length === 0) {
    // It agrees: every dish it named is dated from it.
    if (field) await dateMenuDishes(watch.communityId, listing.id, field.key, read.dishes.map((d) => d.name))
    return { ok: true, filed: 0, pageHash, check: check(null) }
  }
  if (opts.full) {
    const kept = await getMenuReading(watch.communityId, listing.id)
    const lower = (n: string) => n.trim().toLowerCase()
    const had = new Set((kept?.dishes ?? []).map((d) => lower(d.name)))
    const hadMissing = new Set((kept?.missing ?? []).map(lower))
    if (
      kept &&
      (kept.status === 'proposed' || kept.status === 'skipped') &&
      found.every((d) => had.has(lower(d.name))) &&
      missing.every((n) => hadMissing.has(lower(n)))
    ) {
      return { ok: true, filed: 0, pageHash, check: check('before') }
    }
  }
  await saveMenuReading(watch.communityId, listing.id, {
    status: 'proposed',
    sourceUrl: read.sourceUrl ?? watch.url,
    dishes: read.dishes,
    missing,
    note: changedMenuNote(found, missing, changed || !lookingFor.length),
    model: read.model,
  })
  return { ok: true, filed: 1, pageHash, check: check('filed') }
}

/** A watched menu page that stopped opening (the user, Oct 21): its website
 *  is searched again, the way the Main dishes tab finds a menu (findMenus),
 *  for the page the menu is on now. One found is saved as a reading from
 *  there, waiting on the Main dishes tab: approving it makes that page the
 *  menu link, and the watch follows. The watch keeps failing till then, so
 *  the admin is told, and says where the menu went.
 *
 *  Not searched again: a place whose latest reading is already from another
 *  page (waiting, or decided), or with no website or AI; nor, on the daily
 *  run, past its budget. Returns what to add to the watch's error. */
async function lookElsewhere(
  watch: Pick<Watch, 'communityId' | 'url'>,
  listing: DirectoryResource,
  category: CategoryConfig,
  budget: MenuReadBudget | undefined,
  opts: { apiKey: string | undefined; full?: boolean; fetchImpl?: typeof fetch; render: Render | null },
): Promise<string> {
  const website = menuWebsite(listing, category)
  if (!website || !opts.apiKey) return ''
  const kept = await getMenuReading(watch.communityId, listing.id)
  const other = kept && kept.status !== 'failed' && kept.sourceUrl && kept.sourceUrl !== watch.url && /^https?:\/\//i.test(kept.sourceUrl) ? kept.sourceUrl : null
  if (other) return `. Its menu was last read from ${other}: see the Main dishes tab.`
  if (budget && !opts.full) {
    if ((budget.searches ?? 0) <= 0 || budget.aiReads <= 0) return ''
    budget.searches!--
    budget.aiReads--
  }
  const notFound = '. Its website was searched again, and no other page on it has the menu.'
  const pages = (await findMenus(website, { fetchImpl: opts.fetchImpl, render: opts.render })).filter((p) => p.url !== watch.url)
  if (!pages.length) return notFound
  const listed = listedDishes(listing, category)
  // Within the run's minute: the AI reads one page after another.
  const read = await readMenus(pages, listing.name, { apiKey: opts.apiKey, fetchImpl: opts.fetchImpl, listed, budgetMs: 15_000 }).catch(() => null)
  const url = read?.dishes.length ? read.sourceUrl : null
  if (!read || !url || url === watch.url || isOrderingApp(url) || readElsewhere(url, website, null)) return notFound
  const missing = read.missing ?? []
  await saveMenuReading(watch.communityId, listing.id, {
    status: 'proposed',
    sourceUrl: url,
    dishes: read.dishes,
    missing,
    note: menuMovedNote(url, newDishes(read.dishes, listed), missing),
    model: read.model,
  })
  return `. Its menu was found at ${url}, waiting on the Main dishes tab.`
}

/** The dishes the listing has dated from its menu (details.itemMenu). */
function menuDated(listing: DirectoryResource): string[] {
  const all = listing.itemMenu
  if (!all || typeof all !== 'object') return []
  return Object.values(all as Record<string, unknown>).flatMap((m) => (m && typeof m === 'object' ? Object.keys(m) : []))
}
