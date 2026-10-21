import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { keepsMenuLink } from '@/lib/menuLink'
import { readMenu, readMenuPage, troubleClause, type Render, type Trouble } from '@/lib/menuReader'
import { getMenuReading, saveMenuReading } from '@/lib/menuReadingStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import { changedMenuNote, listedDishes, menuHash, MENU_AI_READS_PER_RUN, MENU_WATCH_CREATOR, menuWatchChanges, newDishes, wantedMenuWatches } from '@/lib/menuWatch'
import { checkFrom, pageCheck } from '@/lib/listingPageWatch'
import { pageRenderer } from '@/lib/renderPage'
import type { Watch, WatchCheck, WatchOutcome } from '@/lib/watches'
import type { ResourceRow } from '@/types'

// The menu watches' database and network half (menuWatch.ts has the rules).
// Server-only.

/** How many AI reads this run has left: one object shared by a cron run's
 *  watches, the menus' and the shul and mikvah pages' (listingPageRun.ts)
 *  alike. A run without one ("Check now", one watch) isn't limited.
 *  `renders`: how many menu pages it may draw in a browser (renderPage.ts),
 *  each several seconds of a run that has a minute for every watch. */
export type MenuReadBudget = { aiReads: number; renders?: number }

/** Menu pages a cron run may draw in a browser. */
export const MENU_RENDERS_PER_RUN = 1

export function newMenuReadBudget(): MenuReadBudget {
  return { aiReads: MENU_AI_READS_PER_RUN, renders: MENU_RENDERS_PER_RUN }
}

/** Gives every food place with a menu link its watch, and takes away the
 *  run's own watches on links nobody has any more. Never touches a watch an
 *  admin added. Returns what it did, for the run's log. */
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
    const wanted = wantedMenuWatches(categories, ((rows ?? []) as ResourceRow[]).map(normalizeRow))
    const { watches, available } = await listWatches(slug)
    if (!available) continue
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
 *  read it and keep any dishes the listing doesn't have for an admin.
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
  // Why it couldn't be read, the first reason, for the watch's error.
  const trouble: { t?: Trouble } = {}
  const source = await readMenuPage(watch.url, { fetchImpl: opts.fetchImpl, render, trouble: (t) => void (trouble.t ??= t) }).finally(() => renderer?.close())
  if (!source && undrawn) return { ok: true, filed: 0 }
  if (!source) {
    return {
      ok: false,
      error: trouble.t ? `Couldn’t read the menu: ${troubleClause(trouble.t)}` : 'Couldn’t read the menu (blocked, moved, or built in the browser)',
      ...(opts.full ? { check: { what: 'dishes', from: null, result: 'unreadable', read: [], differences: [], queue: null } as const } : {}),
    }
  }
  const pageHash = menuHash(source)
  const changed = !!watch.pageHash && watch.pageHash !== pageHash
  // The first read sets the baseline; an unchanged menu is left alone.
  if (!opts.full && !changed) return { ok: true, filed: 0, pageHash }

  // Changed. Without the AI, or with this run's reads spent, the old
  // fingerprint stays, so the change is still news next time.
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) {
    if (!opts.full) return { ok: true, filed: 0 }
    return { ok: true, filed: 0, check: { what: 'dishes', from: checkFrom(source), result: 'nothing', read: [], differences: [], queue: null, note: 'The AI isn’t set up here, so the menu wasn’t read.' } }
  }
  if (budget && !opts.full) {
    if (budget.aiReads <= 0) return { ok: true, filed: 0 }
    budget.aiReads--
  }
  let read
  try {
    read = await readMenu(source, listing.name, { apiKey, fetchImpl: opts.fetchImpl })
  } catch (err) {
    return { ok: false, error: `${changed ? 'The menu changed, and the AI' : 'The AI'} couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  const found = newDishes(read.dishes, listedDishes(listing, category))
  const check = (queue: WatchCheck['queue']) =>
    pageCheck('dishes', checkFrom(source, { pictures: read.fromPictures }), read.dishes.length ? [read.dishes.map((d) => d.name).join(', ')] : [], {
      differences: found.length ? [`Not on the listing: ${found.map((d) => d.name).join(', ')}`] : [],
      queue,
    })
  if (found.length === 0) return { ok: true, filed: 0, pageHash, check: check(null) }
  if (opts.full) {
    const kept = await getMenuReading(watch.communityId, listing.id)
    const had = new Set((kept?.dishes ?? []).map((d) => d.name.trim().toLowerCase()))
    if (kept && (kept.status === 'proposed' || kept.status === 'skipped') && found.every((d) => had.has(d.name.trim().toLowerCase()))) {
      return { ok: true, filed: 0, pageHash, check: check('before') }
    }
  }
  await saveMenuReading(watch.communityId, listing.id, {
    status: 'proposed',
    sourceUrl: read.sourceUrl ?? watch.url,
    dishes: read.dishes,
    note: changedMenuNote(found),
    model: read.model,
  })
  return { ok: true, filed: 1, pageHash, check: check('filed') }
}
