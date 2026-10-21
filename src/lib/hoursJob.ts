import { LISTING_PAGE_FOUND_CREATOR, pageReadsFor } from './listingPageWatch'
import { normalizeWatchUrl, watchHealth, type Watch } from './watches'
import type { HoursPage } from './hoursPages'
import type { JobCounts } from './watchJobs'
import type { CategoryConfig } from './categories'

// The hours job (the user, Oct 21): every place in a category with named
// weekly hours (a mikvah's women's, men's and keilim hours) is read from
// its own website's pages, found every morning from the website Google gave
// us (hoursPages.ts). A page with a clock time on it is watched, as a
// listing-page watch the daily run reads (listingPageRun.ts); one an admin
// gives sits beside them and is never taken away. The Watches tab's job
// page shows every place, in sections.
//
// Pure: no database, no network. hoursJobRun.ts searches and saves.

/** The `created_by` of a page the morning's search found. Read by the
 *  daily run like any listing-page watch (isListingPageWatch); only the
 *  search adds or takes these away. */
export const HOURS_FOUND_CREATOR = LISTING_PAGE_FOUND_CREATOR

/** "No hours online" or "Turn off this place": kept as a watch that's
 *  never read, so the search leaves the place alone. */
export const HOURS_OFF_CREATOR = 'hours off'

export const hoursOffUrl = (resourceId: string) => `https://guide.invalid/hours-off/${resourceId}`
export const isHoursOff = (w: Pick<Watch, 'createdBy'>) => w.createdBy === HOURS_OFF_CREATOR
export const isFoundHoursPage = (w: Pick<Watch, 'createdBy'>) => w.createdBy === HOURS_FOUND_CREATOR

/** A clock time: "7:30PM", "4:30 AM", "10 a.m.". In the Oct 21 dry run the
 *  pages the AI read hours from were exactly the ones with one, so the
 *  search needs no AI. */
const CLOCK_TIME = /\b\d{1,2}(:\d\d)?\s*(am|pm|a\.m\.|p\.m\.)/i

/** Whether a page may give weekly hours: a clock time in its words. A PDF
 *  can't be told without reading it, so it may. */
export function looksLikeHours(source: { text: string | null; pdf: string | null }): boolean {
  return source.pdf !== null || CLOCK_TIME.test(source.text ?? '')
}

/** The categories with the job: weekly hours fields with names, not only
 *  the plain "Hours" Google keeps (pageReadsFor leaves that out when there
 *  are named ones). */
export function hoursJobCategories<C extends Pick<CategoryConfig, 'id' | 'detailFields'>>(categories: readonly C[]): C[] {
  return categories.filter((c) => {
    const reads = pageReadsFor(c)
    return reads?.kind === 'hours' && !reads.keys.includes('hours')
  })
}

/** The job's name: "Mikvah hours", from the category's own name. */
export function hoursJobName(categories: readonly Pick<CategoryConfig, 'label'>[]): string {
  return categories.length === 1 ? `${categories[0].label} hours` : 'Hours'
}

const ITS_WEBSITE = 'its website'

/** A found page's label: the place, then the words its website links it by. */
export function foundPageLabel(name: string, link: string | null): string {
  return `${name} · ${link ?? ITS_WEBSITE}`
}

/** Where a source came from, in a line. */
export function sourceLine(w: Pick<Watch, 'createdBy' | 'label'>): string {
  if (!isFoundHoursPage(w)) return 'Added by hand'
  const link = w.label?.slice(w.label.lastIndexOf(' · ') + 3)
  return !link || link === ITS_WEBSITE ? 'Found from its website' : `Found from its website’s ${link} link`
}

/** What the morning's search found for one place: the pages with clock
 *  times on them, and the ones that didn't load (kept as they are, so a
 *  slow page isn't taken away for a day). Null: its website didn't open. */
export type HoursSearch = { found: HoursPage[]; unloaded: string[] } | null

/** Two addresses for the same page: http or https, with www. or without,
 *  with a closing slash or without (live has a page given as
 *  http://lmcmikvah.org/ that the search finds as https://). */
export function samePage(a: string, b: string): boolean {
  const key = (u: string) => (normalizeWatchUrl(u) ?? u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
  return key(a) === key(b)
}
const same = samePage

/** What the search changes for one place: found pages not watched yet are
 *  added; its own found pages the search no longer finds go. A page an
 *  admin gave is never touched, nor a place that's off, nor anything when
 *  its website didn't open. */
export function hoursWatchChanges(
  place: { id: string; name: string },
  search: HoursSearch,
  watches: readonly Watch[],
): { add: { url: string; label: string }[]; remove: string[] } {
  if (!search || watches.some((w) => w.resourceId === place.id && isHoursOff(w))) return { add: [], remove: [] }
  const add = search.found.filter((p) => !watches.some((w) => same(w.url, p.url))).map((p) => ({ url: p.url, label: foundPageLabel(place.name, p.link) }))
  const keep = [...search.found.map((p) => p.url), ...search.unloaded]
  const remove = watches.filter((w) => w.resourceId === place.id && isFoundHoursPage(w) && !keep.some((u) => same(u, w.url))).map((w) => w.id)
  return { add, remove }
}

/** Where a place sits on the job's page:
 *   to_check   a page says something different from the listing, or
 *              something it couldn't compare
 *   waiting    a page not compared with the listing yet
 *   checked    its pages agree with the listing
 *   cant_read  no page to read, none loads, or none gives weekly hours
 *   off        "No hours online" or turned off */
export type HoursSection = 'to_check' | 'waiting' | 'checked' | 'cant_read' | 'off'

export type HoursPlace = { pages: Watch[]; off: boolean }

const loads = (w: Watch, now: number) => {
  const state = watchHealth(w, now).state
  return state !== 'failing' && state !== 'stale'
}

export function hoursSection(p: HoursPlace, now: number): HoursSection {
  if (p.off) return 'off'
  const live = p.pages.filter((w) => w.active)
  if (!live.length) return p.pages.length ? 'off' : 'cant_read'
  const ok = live.filter((w) => loads(w, now))
  if (!ok.length) return 'cant_read'
  const results = ok.map((w) => (w.lastRunAt && w.lastCheck ? w.lastCheck.result : null))
  if (results.some((r) => r === 'differs' || r === 'unsure')) return 'to_check'
  if (results.some((r) => r === null)) return 'waiting'
  if (results.every((r) => r === 'nothing' || r === 'unreadable')) return 'cant_read'
  return 'checked'
}

/** A place with an active page that didn't load this morning. */
export function hoursDidntLoad(p: HoursPlace, now: number): boolean {
  return !p.off && p.pages.some((w) => w.active && !loads(w, now))
}

/** The Watches tab row's counts. */
export function hoursCounts(places: readonly HoursPlace[], now: number): JobCounts & { waiting: number; off: number } {
  const sections = places.map((p) => hoursSection(p, now))
  const n = (s: HoursSection) => sections.filter((x) => x === s).length
  return {
    checked: n('checked'),
    toCheck: n('to_check'),
    cantRead: n('cant_read'),
    didntLoad: places.filter((p) => hoursDidntLoad(p, now)).length,
    waiting: n('waiting'),
    off: n('off'),
  }
}
