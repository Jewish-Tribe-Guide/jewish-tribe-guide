import { getAdminClient } from '@/lib/supabase/admin'
import { listCategoriesUncached } from '@/lib/categoryStore'
import { normalizeRow } from '@/lib/resourceStore'
import { addWatch, listWatches, removeWatch } from '@/lib/watchStore'
import { fetchPublic, troubleClause, type Trouble } from '@/lib/menuReader'
import { WATCH_FETCH_HEADERS } from '@/lib/websiteWatch'
import { readListingPage, type PageSource } from '@/lib/listingPageRun'
import { hoursPages, timesPages, type HoursPage } from '@/lib/hoursPages'
import { HOURS_FOUND_CREATOR, PAGE_JOBS, hoursJobCategories, hoursWatchChanges, looksLikeHours, timesPagesToRead, type PageJob } from '@/lib/hoursJob'
import type { CategoryConfig } from '@/lib/categories'
import type { DirectoryResource, ResourceRow } from '@/types'

// The hours job's database and network half (hoursJob.ts has the rules).
// Run every morning by /api/cron/watches before the reads, and by the job's
// page for a place it shows as can't be read. Fetches only: the AI reads a
// page when the daily run does. Server-only.

/** How it reaches the web, for tests. */
export type HoursReach = {
  fetchHome?: (url: string) => Promise<{ url: string; body: string } | { error: string }>
  readPage?: (url: string) => Promise<PageSource | null>
}

/** A website's home page, after its redirects, or why it didn't open. */
export async function fetchHome(url: string): Promise<{ url: string; body: string } | { error: string }> {
  let trouble: Trouble | null = null
  const page = await fetchPublic(url, { headers: WATCH_FETCH_HEADERS, trouble: (t) => (trouble = t) })
  if (page?.type === 'html') return page
  return { error: trouble ? troubleClause(trouble) : 'it isn’t a web page' }
}

/** A place's pages that may give its weekly hours, or a shul's its
 *  davening times, from its website: its home page and the links on it
 *  (hoursPages, timesPages), each kept if it has a clock time on it
 *  (looksLikeHours), a shul's if it has a davening time and isn't another
 *  copy of a calendar (timesPagesToRead). One that doesn't load is
 *  `unloaded`. */
export async function searchHoursPages(website: string, reach: HoursReach = {}, job: PageJob = 'hours'): Promise<{ found: HoursPage[]; unloaded: string[] } | { error: string }> {
  const home = await (reach.fetchHome ?? fetchHome)(website)
  if ('error' in home) return home
  // A shul's calendar may be posted as pictures (calendarPictures.ts).
  const read = reach.readPage ?? ((u: string) => readListingPage(u, { pictures: job === 'times' }))
  const pages = (job === 'times' ? timesPages : hoursPages)(home.url, home.body)
  const sources = await Promise.all(pages.map((p) => read(p.url).catch(() => null)))
  const keep = job === 'times' ? timesPagesToRead(sources) : sources.map((s) => !!s && looksLikeHours(s))
  return {
    found: pages.filter((_, i) => keep[i]),
    unloaded: pages.filter((_, i) => !sources[i]).map((p) => p.url),
  }
}

/** Long enough for a slow website, short enough to leave the morning's
 *  run its time for the reads (its 60s, /api/cron/watches). */
export const SEARCH_DEADLINE_MS = 20_000

const deadline = <T,>(work: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([work, new Promise<null>((done) => setTimeout(() => done(null), ms))])

/** The places with the job in one community, and their categories. */
export async function hoursJobPlaces(community: string, job: PageJob = 'hours'): Promise<{ categories: CategoryConfig[]; places: DirectoryResource[] }> {
  const categories = hoursJobCategories(await listCategoriesUncached(community), job)
  if (!categories.length) return { categories, places: [] }
  const { data, error } = await getAdminClient()
    .from('resource')
    .select('*')
    .eq('community_id', community)
    .eq('status', 'approved')
    .in(
      'category',
      categories.map((c) => c.id),
    )
  if (error) throw new Error(`Couldn’t list the places: ${error.message}`)
  return { categories, places: ((data ?? []) as ResourceRow[]).map(normalizeRow).sort((a, b) => a.name.localeCompare(b.name)) }
}

export const websiteOf = (p: DirectoryResource): string | null => (typeof p.website === 'string' && p.website.trim() ? p.website.trim() : null)

/** Watches every place's hours pages, and every shul's pages with its
 *  times, found from its website, and takes away the search's own pages
 *  it no longer finds (hoursWatchChanges). All places of both jobs at
 *  once, each given SEARCH_DEADLINE_MS; one that takes longer, or whose
 *  website doesn't open, is left as it is. Returns what it did, for the
 *  run's log. */
export async function syncHoursWatches(reach: HoursReach = {}, ms = SEARCH_DEADLINE_MS): Promise<{ community: string; added: number; removed: number }[]> {
  const { data, error } = await getAdminClient().from('community').select('slug')
  if (error) throw new Error(`Couldn’t list the communities: ${error.message}`)
  const out = []
  for (const { slug } of (data ?? []) as { slug: string }[]) {
    const jobs = await Promise.all(PAGE_JOBS.map(async (job) => (await hoursJobPlaces(slug, job)).places.map((place) => ({ place, job }))))
    const places = jobs.flat()
    if (!places.length) continue
    const { watches, available } = await listWatches(slug)
    if (!available) continue
    const searches = await Promise.all(
      places.map(async ({ place: p, job }) => {
        const website = websiteOf(p)
        if (!website) return null
        const got = await deadline(searchHoursPages(website, reach, job).catch(() => null), ms)
        return got && !('error' in got) ? got : null
      }),
    )
    let added = 0
    let removed = 0
    for (const [i, { place }] of places.entries()) {
      const { add, remove } = hoursWatchChanges(place, searches[i], watches)
      for (const w of add) {
        if (await addWatch(slug, { kind: 'website', url: w.url, resourceId: place.id, label: w.label, createdBy: HOURS_FOUND_CREATOR })) added++
      }
      for (const id of remove) {
        await removeWatch(slug, id)
        removed++
      }
    }
    out.push({ community: slug, added, removed })
  }
  return out
}
