import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { getResourceRowById, normalizeRow } from '@/lib/resourceStore'
import { keepsMenuLink } from '@/lib/menuLink'
import { readMenu, readMenuPage } from '@/lib/menuReader'
import { saveMenuReading } from '@/lib/menuReadingStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import { changedMenuNote, listedDishes, menuHash, MENU_AI_READS_PER_RUN, MENU_WATCH_CREATOR, menuWatchChanges, newDishes, wantedMenuWatches } from '@/lib/menuWatch'
import type { Watch, WatchOutcome } from '@/lib/watches'
import type { ResourceRow } from '@/types'

// The menu watches' database and network half (menuWatch.ts has the rules).
// Server-only.

/** How many AI reads this run has left: one object shared by a cron run's
 *  watches, the menus' and the shul and mikvah pages' (listingPageRun.ts)
 *  alike. A run without one ("Check now", one watch) isn't limited. */
export type MenuReadBudget = { aiReads: number }

export function newMenuReadBudget(): MenuReadBudget {
  return { aiReads: MENU_AI_READS_PER_RUN }
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
 *  read it and keep any dishes the listing doesn't have for an admin. */
export async function runMenuWatch(
  watch: Pick<Watch, 'communityId' | 'url' | 'resourceId' | 'pageHash'>,
  budget?: MenuReadBudget,
  opts: { fetchImpl?: typeof fetch; apiKey?: string | undefined } = {},
): Promise<WatchOutcome> {
  if (!watch.resourceId) return { ok: false, error: 'This menu watch isn’t tied to a listing' }
  const row = await getResourceRowById(watch.resourceId, watch.communityId)
  if (!row || row.status !== 'approved') return { ok: false, error: 'The place this menu belongs to isn’t in the guide any more' }
  const listing = normalizeRow(row)
  const category = (await listCategoriesUncached(watch.communityId)).find((c) => c.id === listing.category)
  if (!category || !keepsMenuLink(category)) return { ok: false, error: 'The place this menu belongs to has no list of dishes' }

  const source = await readMenuPage(watch.url, { fetchImpl: opts.fetchImpl })
  if (!source) return { ok: false, error: 'Couldn’t read the menu (blocked, moved, or built in the browser)' }
  const pageHash = menuHash(source)
  // The first read sets the baseline; an unchanged menu is left alone.
  if (!watch.pageHash || watch.pageHash === pageHash) return { ok: true, filed: 0, pageHash }

  // Changed. Without the AI, or with this run's reads spent, the old
  // fingerprint stays, so the change is still news next time.
  const apiKey = 'apiKey' in opts ? opts.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: true, filed: 0 }
  if (budget) {
    if (budget.aiReads <= 0) return { ok: true, filed: 0 }
    budget.aiReads--
  }
  let read
  try {
    read = await readMenu(source, listing.name, { apiKey, fetchImpl: opts.fetchImpl })
  } catch (err) {
    return { ok: false, error: `The menu changed, and the AI couldn’t read it (${err instanceof Error ? err.message : String(err)})` }
  }
  const found = newDishes(read.dishes, listedDishes(listing, category))
  if (found.length === 0) return { ok: true, filed: 0, pageHash }
  await saveMenuReading(watch.communityId, listing.id, {
    status: 'proposed',
    sourceUrl: read.sourceUrl ?? watch.url,
    dishes: read.dishes,
    note: changedMenuNote(found),
    model: read.model,
  })
  return { ok: true, filed: 1, pageHash }
}
