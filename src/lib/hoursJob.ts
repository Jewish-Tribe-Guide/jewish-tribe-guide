import { LISTING_PAGE_FOUND_CREATOR, pageReadsFor } from './listingPageWatch'
import { normalizeWatchUrl, settles, watchHealth, type Watch } from './watches'
import type { HoursPage } from './hoursPages'
import type { JobCounts } from './watchJobs'
import type { CategoryConfig } from './categories'
import { googleKeeps } from './contactRead'

// The hours job (the user, Oct 21): every place in a category with named
// weekly hours (a mikvah's women's, men's and keilim hours) is read from
// its own website's pages, found every morning from the website Google gave
// us (hoursPages.ts). A page with a clock time on it is watched, as a
// listing-page watch the daily run reads (listingPageRun.ts); one an admin
// gives sits beside them and is never taken away. The Watches tab's job
// page shows every place, in sections.
//
// Shuls too (the user, Oct 21: "I don't mind adding shuls automatically,
// but we should be able to see what they're reading"): every place whose
// category has davening times, its pages found by the links a shul's
// website calls them by (timesPages), on a Shul times page of its own.
// An admin can stop any page, found or given, and it stays stopped: the
// search never adds it again.
//
// Pure: no database, no network. hoursJobRun.ts searches and saves.

/** Which job: a mikvah's named weekly hours, or a shul's davening times. */
export type PageJob = 'hours' | 'times'
export const PAGE_JOBS: readonly PageJob[] = ['hours', 'times']

/** The words that differ between the two jobs' pages. */
export function jobWords(job: PageJob) {
  return job === 'times'
    ? {
        what: 'davening times',
        none: 'no davening times',
        noneOnline: 'No times online',
        unsure: 'times it couldn’t set beside the listing',
        pageLabel: 'Its davening times page',
        placeholder: 'its-website.org/davening',
      }
    : {
        what: 'hours',
        none: 'no weekly hours',
        noneOnline: 'No hours online',
        unsure: 'hours it couldn’t set beside the listing',
        pageLabel: 'Its hours page',
        placeholder: 'its-website.org/hours',
      }
}

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

/** "Stop reading this page": kept, never read, so the morning's search,
 *  which adds only pages not watched already, never finds it again. "Read
 *  it again" makes it a page given by hand. */
export const PAGE_STOPPED_CREATOR = 'listing pages (stopped)'
export const isStoppedPage = (w: Pick<Watch, 'createdBy'>) => w.createdBy === PAGE_STOPPED_CREATOR

/** What the last search of a place's website said when it found no page
 *  (the user, Oct 22: the job's page shows what was done, not search
 *  again): kept as a watch that's never read, `lastRunAt` when and
 *  `lastError` why. One per place and job; gone once it has a page. */
export const HOURS_SEARCHED_CREATOR = 'hours search'
export const hoursSearchedUrl = (resourceId: string, job: PageJob) => `https://guide.invalid/hours-search/${job}/${resourceId}`
export const isHoursSearched = (w: Pick<Watch, 'createdBy'>) => w.createdBy === HOURS_SEARCHED_CREATOR

/** A place with no website, said as its search would say it. */
export const NO_WEBSITE = 'No website on Google.'
/** A place its search hasn't reached yet. */
export const NOT_SEARCHED = 'Not searched yet.'

/** Why a search of a place's website left it with no page: `got` is the
 *  search (null when it ran out of time), `pages` how many it has after.
 *  Null when it has one. */
export function searchReason(website: string | null, got: { found: unknown[] } | { error: string } | null, pages: number, job: PageJob): string | null {
  if (pages) return null
  if (!website) return NO_WEBSITE
  if (!got) return 'Its website took too long to read.'
  if ('error' in got) return `Its website wouldn’t open: ${got.error}.`
  return `Read its website: ${jobWords(job).none} on it.`
}

/** A clock time: "7:30PM", "4:30 AM", "10 a.m.". In the Oct 21 dry run the
 *  pages the AI read hours from were exactly the ones with one, so the
 *  search needs no AI. */
const CLOCK_TIME = /\b\d{1,2}(:\d\d)?\s*(am|pm|a\.m\.|p\.m\.)/i

/** Booking ahead: a mikvah whose hours are "by appointment, 48 hours
 *  ahead" has no clock time, and its note is all its page says (Mei
 *  Shalva, Oct 22). */
const BY_APPOINTMENT = /\bappointments?\b/i

/** Whether a page may give weekly hours or a section's note: a clock time
 *  in its words, or booking by appointment. A PDF can't be told without
 *  reading it, so it may. */
export function looksLikeHours(source: { text: string | null; pdf: string | null }): boolean {
  return source.pdf !== null || CLOCK_TIME.test(source.text ?? '') || BY_APPOINTMENT.test(source.text ?? '')
}

/** What a davening time is called beside its clock time. */
const DAVENING = /\b(shacharit|shacharis|shachris|shaharit|mincha|minchah|maariv|ma’ariv|ma'ariv|arvit|musaf|minyan|minyans|minyanim|daven|davening|services?|kabbalat|kabbalas|tefill?ah|tefillot|prayers?|selichot|slichos|neilah|kol nidre)\b/i

/** The lines of a shul's page with a davening time: a clock time with a
 *  davening word on its line or the one beside it ("Shacharit" over
 *  "7:15 AM"). */
function daveningLines(lines: readonly string[]): string[] {
  return lines.filter((l, i) => CLOCK_TIME.test(l) && DAVENING.test(`${lines[i - 1] ?? ''} ${l} ${lines[i + 1] ?? ''}`))
}

/** Whether a page's words give a davening time. */
export function hasDaveningTimes(text: string): boolean {
  return daveningLines(text.split('\n')).length > 0
}

/** A page as the search reads it (listingPageRun.ts's PageSource). */
type SearchSource = { text: string | null; pdf: string | null; weeks?: readonly { lines: readonly string[] }[]; pictures?: readonly string[] }

/** Which of a shul's pages (home page first, then its links, best first)
 *  to read its times from (Oct 21's read-only check of every shul page):
 *  - one with a davening time on it, not any clock time: a museum's
 *    opening hours (the Rosenbach's), or a footer's office hours on every
 *    page (Mikveh Israel's About and Visit), aren't davening times;
 *  - of pages showing one calendar (a site-wide widget: Beth Zion-Beth
 *    Israel's five pages all showed the same week), only the one whose own
 *    words give the most davening times, so the week is read once. A PDF
 *    can't be told without reading it, so it's read, and so is a calendar
 *    posted as pictures (Mikveh Israel's month, calendarPictures.ts), once
 *    however many pages show it. */
export function timesPagesToRead(sources: readonly (SearchSource | null)[]): boolean[] {
  const calendarOf = (s: SearchSource) =>
    s.pictures?.length ? JSON.stringify(s.pictures) : s.weeks?.some((w) => w.lines.length) ? JSON.stringify(s.weeks.map((w) => w.lines)) : null
  const own = (s: SearchSource) => {
    const shown = new Set(s.weeks?.flatMap((w) => w.lines))
    return daveningLines((s.text ?? '').split('\n').filter((l) => !shown.has(l))).length
  }
  const keep = sources.map((s) => !!s && (s.pdf !== null || !!s.pictures?.length || hasDaveningTimes(s.text ?? '')))
  const best = new Map<string, number>()
  sources.forEach((s, i) => {
    const calendar = s && keep[i] ? calendarOf(s) : null
    if (calendar === null) return
    const had = best.get(calendar)
    if (had === undefined || own(s!) > own(sources[had]!)) best.set(calendar, i)
  })
  return keep.map((k, i) => {
    const calendar = k ? calendarOf(sources[i]!) : null
    return k && (calendar === null || best.get(calendar) === i)
  })
}

/** The categories with the job. Hours: weekly hours fields with names,
 *  not only the plain "Hours" Google keeps (pageReadsFor leaves that out
 *  when there are named ones). Times: davening times. */
export function hoursJobCategories<C extends Pick<CategoryConfig, 'id' | 'detailFields'>>(categories: readonly C[], job: PageJob = 'hours'): C[] {
  return categories.filter((c) => {
    const reads = pageReadsFor(c)
    return job === 'times' ? reads?.kind === 'times' : reads?.kind === 'hours' && !reads.keys.includes('hours')
  })
}

/** The job's name: "Mikvah hours", from the category's own name; "Shul
 *  times", as the guide calls them. */
export function hoursJobName(categories: readonly Pick<CategoryConfig, 'label'>[], job: PageJob = 'hours'): string {
  if (job === 'times') return 'Shul times'
  return categories.length === 1 ? `${categories[0].label} hours` : 'Hours'
}

const ITS_WEBSITE = 'its website'

/** A found page's label: the place, then the words its website links it by. */
export function foundPageLabel(name: string, link: string | null): string {
  return `${name} · ${link ?? ITS_WEBSITE}`
}

/** Where a source came from, in a line. */
export function sourceLine(w: Pick<Watch, 'createdBy' | 'label'>): string {
  if (isStoppedPage(w)) return 'Stopped'
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
 *  admin gave or stopped is never touched, nor a place that's off, nor
 *  anything when its website didn't open. */
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

/** What a food place's website is read for (Main dishes board 3, Oct 22):
 *  its hours and its phone, each only when Google doesn't keep it on the
 *  listing. Its dishes are its menu's (menuWatch.ts). */
export function homePageReads(category: Pick<CategoryConfig, 'hasPhone' | 'detailFields'>, place: Record<string, unknown>): ('hours' | 'phone')[] {
  const out: ('hours' | 'phone')[] = []
  if (category.detailFields.some((f) => f.key === 'hours' && f.type === 'hours') && !googleKeeps(place, 'hours')) out.push('hours')
  if (category.hasPhone !== false && !googleKeeps(place, 'phone')) out.push('phone')
  return out
}

/** A food place's home page watch: added when its website has something
 *  Google doesn't keep (homePageReads) and nothing watches that page yet;
 *  taken away, its own only, once Google keeps both. A page an admin gave,
 *  stopped or turned off is never touched. */
export function homePageWatchChanges(
  place: { id: string; name: string; website: string | null; details: Record<string, unknown> },
  category: Pick<CategoryConfig, 'hasPhone' | 'detailFields'>,
  watches: readonly Watch[],
): { add: { url: string; label: string }[]; remove: string[] } {
  if (watches.some((w) => w.resourceId === place.id && isHoursOff(w))) return { add: [], remove: [] }
  const url = place.website && normalizeWatchUrl(place.website)
  const want = !!url && homePageReads(category, place.details).length > 0
  const add = want && !watches.some((w) => same(w.url, url)) ? [{ url, label: foundPageLabel(place.name, null) }] : []
  const remove = watches.filter((w) => w.resourceId === place.id && isFoundHoursPage(w) && !(want && same(w.url, url))).map((w) => w.id)
  return { add, remove }
}

/** Where a place sits on the job's page:
 *   to_check   a page says something different from the listing, or
 *              something it couldn't compare
 *   waiting    a page not compared with the listing yet, or pages found
 *              that the morning's run hasn't watched yet
 *   checked    its pages agree with the listing
 *   cant_read  no page to read, none loads, or none gives weekly hours
 *   off        "No hours online" or turned off */
export type HoursSection = 'to_check' | 'waiting' | 'checked' | 'cant_read' | 'off'

/** `found`: no page watched yet, but searching its website just now found
 *  some, which the morning's run will watch and read. `waiting`: how many
 *  of its findings wait on the job page (watchFindings.ts); given, a page
 *  that differs only because of one already decided (Update or Skip) is
 *  settled, not to check. */
export type HoursPlace = { pages: Watch[]; off: boolean; found?: boolean; waiting?: number }

const loads = (w: Watch, now: number) => {
  const state = watchHealth(w, now).state
  return state !== 'failing' && state !== 'stale'
}

export function hoursSection(p: HoursPlace, now: number): HoursSection {
  if (p.off) return 'off'
  // A finding to compare, whatever its pages say this morning.
  if (p.waiting) return 'to_check'
  const live = p.pages.filter((w) => w.active)
  if (!live.length) return p.pages.length ? 'off' : p.found ? 'waiting' : 'cant_read'
  const ok = live.filter((w) => loads(w, now))
  if (!ok.length) return 'cant_read'
  const results = ok.map((w) => (w.lastRunAt && w.lastCheck ? w.lastCheck.result : null))
  const open = ok.some((w) => w.lastRunAt && w.lastCheck && (w.lastCheck.result === 'differs' || w.lastCheck.result === 'unsure') && !settles(w.lastCheck, p.waiting))
  if (open) return 'to_check'
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
