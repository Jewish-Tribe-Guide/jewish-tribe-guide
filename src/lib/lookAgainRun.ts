import { getAdminClient } from './supabase/admin'
import { listCategoriesUncached } from './categoryStore'
import { isCategorySyncEligible } from './categories'
import { listEruvimForAdmin } from './eruvStore'
import { findEruvStatusPages } from './eruvFind'
import { listMenuReadings } from './menuReadingStore'
import { readMenuAgain } from './menuPlaceRead'
import { findOnGoogle, loadGoogleJob } from './googleJobRun'
import { namesOverlap } from './googlePlaces'
import { listWatches } from './watchStore'
import { jobsOff } from './jobOff'
import { listLookRows, getNotThese, saveTry } from './lookAgainStore'
import { dueQueue, lookItems, pickFound, pickPage, LOOKS_PER_NIGHT, type FoundPage, type FoundPlace, type LookAgainLoaded, type LookItem, type LookKind, type LookAgainRun } from './lookAgain'
import type { NightKindId } from './jobRuns'

// Look again, on the server (lookAgain.ts): what it tries, each try, and the
// night's run (/api/cron/look-again). Server-only.

/** The job each kind is part of: turned off there, it's not tried here. */
const JOB_OF: Record<LookKind, NightKindId> = { eruv: 'eruvs', menu: 'menus', google: 'google' }

/** Everything Look again tries for a community, or has stopped trying. */
export async function loadLookAgain(community: string, now = Date.now()): Promise<LookAgainLoaded> {
  const [{ rows, available }, { eruvim }, { readings }, google, categories, { watches }] = await Promise.all([
    listLookRows(community),
    listEruvimForAdmin(community),
    listMenuReadings(community),
    loadGoogleJob(community, now),
    listCategoriesUncached(community),
    listWatches(community),
  ])
  const failed = readings.filter((r) => r.status === 'failed')
  const groups = categories.filter((c) => !isCategorySyncEligible(c)).map((c) => c.id)
  const db = getAdminClient()
  const [names, leftOut] = await Promise.all([
    failed.length ? db.from('resource').select('id,name').eq('community_id', community).eq('status', 'approved').in('id', failed.map((r) => r.resourceId)) : Promise.resolve({ data: [], error: null }),
    groups.length ? db.from('resource').select('name').eq('community_id', community).eq('status', 'approved').in('category', groups).order('name') : Promise.resolve({ data: [], error: null }),
  ])
  if (names.error) throw new Error(`Failed to load the food places: ${names.error.message}`)
  if (leftOut.error) throw new Error(`Failed to load the groups: ${leftOut.error.message}`)
  const nameOf = new Map(((names.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
  const off = jobsOff(watches)
  const items = lookItems({
    eruvim,
    // A reading for a listing that's gone isn't anyone's to try.
    menus: failed.flatMap((r) => (nameOf.has(r.resourceId) ? [{ id: r.resourceId, name: nameOf.get(r.resourceId)!, reading: r }] : [])),
    google,
    rows,
  }).filter((i) => !off.includes(JOB_OF[i.kind]))
  return { available, items, leftOut: ((leftOut.data ?? []) as { name: string }[]).map((r) => r.name) }
}

/** One try, saved: what it found, if anything. A menu read again is kept
 *  as its reading (proposed or failed again), so it finds nothing here;
 *  `read` says whether it could be read this time. */
export async function tryLook(community: string, item: Pick<LookItem, 'kind' | 'id' | 'name'>, apiKey: string | undefined, now = Date.now()): Promise<{ found: boolean; read?: boolean }> {
  const at = new Date(now).toISOString()
  let found: FoundPage | FoundPlace | null = null
  let read: boolean | undefined
  if (item.kind === 'eruv') {
    const eruv = (await listEruvimForAdmin(community)).eruvim.find((e) => e.id === item.id)
    if (eruv?.website) {
      const pages = await findEruvStatusPages(eruv.website)
      const page = 'found' in pages ? pickPage(pages.found, await getNotThese(community, 'eruv', item.id)) : null
      if (page) found = { url: page.url, status: page.status, words: page.words, at }
    }
  } else if (item.kind === 'google') {
    // Those said to be the wrong place aren't among them (findOnGoogle).
    const place = pickFound(await findOnGoogle(community, item.id), item.name, namesOverlap)
    if (place) found = { ...place, at }
  } else {
    if (!apiKey) throw new Error('The AI reader isn’t set up here (no OPENAI_API_KEY).')
    read = (await readMenuAgain(community, item.id, apiKey))?.status === 'proposed'
  }
  await saveTry(community, item.kind, item.id, at, found)
  return { found: !!found, ...(read === undefined ? {} : { read }) }
}

/** Tried a night, the longest waiting first; none started after this long
 *  into the run's five minutes, and one try may take this long. */
export const LOOKS_FOR_MS = 200_000
export const LOOK_MS = 80_000

/** Every community's due, a few a night. A try that throws or takes too
 *  long is counted as tried all the same, so it goes to the back. */
export async function lookAgainNight(
  apiKey: string | undefined,
  { perNight = LOOKS_PER_NIGHT, forMs = LOOKS_FOR_MS, tryMs = LOOK_MS, now = Date.now }: { perNight?: number; forMs?: number; tryMs?: number; now?: () => number } = {},
): Promise<LookAgainRun> {
  const until = now() + forMs
  const { data: communities, error } = await getAdminClient().from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out = []
  for (const { slug } of (communities ?? []) as { slug: string }[]) {
    const { available, items } = await loadLookAgain(slug, now())
    if (!available) return { skipped: 'migration 092 (look_again) not run' }
    // Without the AI, menus wait: the rest needs none.
    const queue = dueQueue(items.filter((i) => apiKey || i.kind !== 'menu'), now())
    let tried = 0
    let found = 0
    let failed = 0
    for (const item of queue.slice(0, perNight)) {
      if (now() > until) break
      tried++
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = new Promise<'late'>((resolve) => (timer = setTimeout(() => resolve('late'), tryMs)))
      const result = await Promise.race([tryLook(slug, item, apiKey, now()), late])
        .catch((err) => {
          console.error(`[look-again] ${item.name} failed:`, err)
          return 'failed' as const
        })
        .finally(() => clearTimeout(timer))
      if (result === 'late' || result === 'failed') {
        if (result === 'failed') failed++
        await saveTry(slug, item.kind, item.id, new Date(now()).toISOString(), null).catch((err) => console.error(`[look-again] couldn’t save ${item.name}’s try:`, err))
      } else if (result.found) found++
    }
    out.push({ community: slug, tried, found, failed, left: queue.length - tried })
  }
  return { communities: out }
}
