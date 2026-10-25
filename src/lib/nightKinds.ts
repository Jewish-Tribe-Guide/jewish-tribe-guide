import { jobHealth, NIGHTLY_JOBS, type JobId, type JobRun, type KindCount, type NightKindId, type RunKinds } from './jobRuns'
import { watchGroupOf, type ReadsOf } from './watchGroups'
import { isIgnoredSender, isNewsletterWatch } from './newsletter'
import type { ListingInfo, SiteGap } from './listingReads'
import { isListingPageWatch } from './listingPageWatch'
import { isEruvWebsiteWatch } from './eruvWebsite'
import type { Watch } from './watches'

// ── Nightly runs, a line per kind of source (Oct 25) ────────────────────────
// The Watches tab's "Last night" (FinalNightly): Google, Kosher
// certification, Hospitals, Eruvs, Minyan times, Mikvah hours and Menus, each
// its run's time and what was read. Google is the 2 AM job of its own; the
// rest are all the 3 AM watches run, which stays one job (the user, Oct
// 24). Last night is worked out from the sources as they are now (each
// watch's last read, each listing's last Google answer), so a source read
// again since stops showing as missed. The nights before need what each
// run read, so each run saves its count per community and kind
// (job_run.kinds, migration 087). The menus never read are Menus' too:
// the read-menus job reads a few each night (the user, Oct 25). Walks
// have no line.
// Since Oct 25 it's "What's tracked" (the user): a line per kind opens to
// everything it tracks, not only what was missed, with Newsletters (read
// as each email comes in, so no nights) and Other pages (added by hand,
// shown only when there are any). It replaced the tab's watch list.
// Phone, email and hours (Oct 25): a food place's own website, read for
// what Google doesn't have, each place saying why ("Not on Google").
// Pure: the runs route works it out, NightlyRuns.tsx draws it.

export type NightKind = {
  id: NightKindId
  name: string
  /** Null: not read at night (newsletters). */
  job: JobId | null
  about: string
  /** Its job page under the Watches tab, '' for the tab itself. */
  page: string
  /** Said after the count: "2 of 2 lists read". */
  unit?: string
}

export const NIGHT_KINDS: readonly NightKind[] = [
  { id: 'google', name: 'Google', job: 'sync-hours', about: 'Reads every place matched on Google for its name, hours, phone and website.', page: 'google', unit: 'places' },
  { id: 'kosher', name: 'Kosher certification', job: 'watches', about: 'Reads each certifier’s list for the places on it.', page: 'kosher', unit: 'lists' },
  { id: 'hospitals', name: 'Hospitals', job: 'watches', about: 'Reads each hospital’s page on Refuah.', page: 'hospitals' },
  { id: 'eruvs', name: 'Eruvs', job: 'watches', about: 'Reads each eruv’s website for its hotline and email alerts.', page: 'eruv' },
  { id: 'times', name: 'Minyan times', job: 'watches', about: 'Reads each shul’s page of minyan times.', page: 'times' },
  { id: 'newsletters', name: 'Newsletters', job: null, about: 'Reads each shul’s newsletter as it comes in.', page: 'times' },
  { id: 'hours', name: 'Mikvah hours', job: 'watches', about: 'Reads each mikvah’s page of hours.', page: 'hours' },
  { id: 'sites', name: 'Phone, email and hours', job: 'watches', about: 'Reads a place’s own website when Google doesn’t have them.', page: 'dishes' },
  { id: 'menus', name: 'Menus', job: 'watches', about: 'Reads each food place’s menu when it changes, and a few never read each night.', page: 'dishes' },
  { id: 'other', name: 'Other pages', job: 'watches', about: 'Pages added by hand. What they find goes to the moderation queue.', page: '' },
]

type KindWatch = Pick<Watch, 'kind' | 'url' | 'createdBy' | 'label' | 'resourceId'>

/** A watch's kind at night, or null for a newsletter: read as each email
 *  comes in, not at night. */
/** `readsOf`, what each listing's page is read for (by its category, as
 *  the watch list sorts them): a mikvah's page whose label doesn't say
 *  "hours" is still Mikvah hours. `siteGap`: a food place's own website,
 *  read for the phone and hours Google doesn't have, is Phone, email and
 *  hours, not Mikvah hours (Oct 25: five were counted there). A page that
 *  is none of the kinds was added by hand: Other pages. */
export function nightKindOf(w: KindWatch, readsOf?: ReadsOf, siteGap?: SiteGap): Exclude<NightKindId, 'google' | 'newsletters'> | null {
  if (isNewsletterWatch(w) || isIgnoredSender(w)) return null
  if (isEruvWebsiteWatch(w)) return 'eruvs'
  if (isListingPageWatch(w) && w.resourceId && siteGap?.(w.resourceId) != null) return 'sites'
  const group = watchGroupOf(w as Watch, readsOf)
  return group === 'kosher' ? 'kosher' : group === 'hospital' ? 'hospitals' : group === 'menu' ? 'menus' : group === 'times' ? 'times' : group === 'hours' ? 'hours' : 'other'
}

function add(kinds: RunKinds, community: string, kind: NightKindId, read: boolean) {
  const own = (kinds[community] ??= {})
  const count = (own[kind] ??= { of: 0, read: 0 })
  count.of++
  if (read) count.read++
}

/** What the watches run read: `queue`, every watch it meant to; `read`,
 *  the ids of those it read. */
export function countWatchKinds(queue: readonly (KindWatch & Pick<Watch, 'id' | 'communityId'>)[], read: ReadonlySet<string>, readsOf?: ReadsOf, siteGap?: SiteGap): RunKinds {
  const kinds: RunKinds = {}
  for (const w of queue) {
    const kind = nightKindOf(w, readsOf, siteGap)
    if (kind) add(kinds, w.communityId, kind, read.has(w.id))
  }
  return kinds
}

/** What Google's run read, a row per listing it asked about. */
export function countGoogleKinds(rows: readonly { community: string; ok: boolean }[]): RunKinds {
  const kinds: RunKinds = {}
  for (const r of rows) add(kinds, r.community, 'google', r.ok)
  return kinds
}

// ── What the tab shows ──────────────────────────────────────────────────────

/** `link`: a newsletter sender not linked to a shul yet, by its watch's
 *  id, for the tab to link it there. */
export type KindMiss = { name: string; why: string; page: string; link?: string }
/** One source a kind tracks, in "All N tracked": its name and how it is
 *  ("Read Oct 25", "Not loading since Oct 22"). */
export type TrackedSource = { name: string; status: string; bad: boolean; page: string }
export type KindNight = { date: string; result: string; tone: 'good' | 'bad' | 'none' }

export type NightKindView = {
  id: NightKindId
  name: string
  about: string
  /** The run's time ("3:00 AM"), null with no run. */
  when: string | null
  /** "12 of 28 read", or what went wrong. */
  count: string
  /** Its trouble after the count ("ran out of time"); null when all read. */
  trouble: string | null
  misses: KindMiss[]
  /** Everything it tracks, what needs a look first. */
  tracked: TrackedSource[]
  nights: KindNight[]
}

const ZONE = 'America/New_York'
const dayKey = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: ZONE })
const dayName = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ZONE })
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ZONE })
const after = (iso: string | null | undefined, start: number) => !!iso && Date.parse(iso) >= start

function countLine(kind: NightKind, c: KindCount): string {
  const unit = kind.unit ? `${kind.unit} ` : ''
  if (kind.id === 'google' && c.read === c.of) return `${c.of} ${unit}read`
  return `${c.read} of ${c.of} ${unit}read`
}

/** One night's line from what its run saved. */
function nightResult(kind: NightKind, community: string, run: JobRun, latest: boolean): Omit<KindNight, 'date'> {
  if (!run.finishedAt) return latest ? { result: 'Running', tone: 'none' } : { result: 'Started, didn’t finish', tone: 'bad' }
  if (run.ok === false) return { result: 'Failed', tone: 'bad' }
  if (!run.kinds) return { result: 'Not counted', tone: 'none' }
  const c = run.kinds[community]?.[kind.id]
  if (!c) return { result: 'Nothing to read', tone: 'none' }
  return { result: kind.id === 'google' && c.read === c.of ? `${c.read} read` : `${c.read} of ${c.of} read`, tone: c.read === c.of ? 'good' : 'bad' }
}

const byDay = (runs: readonly JobRun[]) => {
  const days = new Map<string, JobRun>()
  for (const r of runs) if (!days.has(dayKey(Date.parse(r.startedAt)))) days.set(dayKey(Date.parse(r.startedAt)), r)
  return days
}

/** Its last 14 nights, newest first: from the first night recorded, and
 *  today only once it has run. `newMenus`: for Menus, the read-menus
 *  job's runs, a night's first reads said after its count. */
export function kindNights(kind: NightKind, community: string, runs: readonly JobRun[], now: number, newMenus: readonly JobRun[] = []): KindNight[] {
  if (!runs.length) return []
  const days = byDay(runs)
  const firstReads = byDay(newMenus)
  const first = dayKey(Date.parse(runs[runs.length - 1].startedAt))
  const nights: KindNight[] = []
  for (let i = 0; i < 14; i++) {
    const t = now - i * 86_400_000
    const key = dayKey(t)
    if (key < first) break
    const run = days.get(key)
    if (!run && i === 0) continue
    const night = run ? nightResult(kind, community, run, run === runs[0]) : { result: 'Didn’t run', tone: 'bad' as const }
    const read = firstReads.get(key)?.kinds?.[community]?.menus?.read
    nights.push({ date: dayName(t), ...night, ...(read && /read$/.test(night.result) ? { result: `${night.result} · ${read} new ${read === 1 ? 'menu' : 'menus'} read` } : {}) })
  }
  return nights
}

/** A watch's name on the tab, its place's: "Menu · Say She Ate", "Beth
 *  Am · davening times on their website", "Center City Eruv’s website",
 *  "Pennsylvania Hospital on Refuah". */
function watchName(w: Pick<Watch, 'label' | 'url'>): string {
  const place = w.label?.replace(/^Menu · /, '').split(' · ')[0].replace(/(’s website| on Refuah)$/, '')
  return place || w.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')
}

type Live = { count: KindCount; misses: KindMiss[]; failed: number; never: number; notReached: number }

/** A food place whose menu was never read (menuPlaceRead.ts). */
export type UnreadMenu = { id: string; name: string }

/** `unread`, for Menus: a place never read is missed as Never read, its
 *  menu's watch or not (one that loaded only checked for a change). */
function liveWatches(kind: NightKind, watches: readonly Watch[], start: number, unread: readonly UnreadMenu[], readsOf?: ReadsOf, siteGap?: SiteGap): Live {
  const own = watches.filter((w) => w.active && Date.parse(w.createdAt) < start && nightKindOf(w, readsOf, siteGap) === kind.id)
  const live: Live = { count: { of: own.length, read: 0 }, misses: [], failed: 0, never: 0, notReached: 0 }
  const neverRead = new Map(unread.map((u) => [u.id, u]))
  const watched = new Set<string>()
  for (const w of own) {
    const place = w.resourceId ? neverRead.get(w.resourceId) : undefined
    if (place) {
      if (!watched.has(place.id)) live.misses.push({ name: place.name, why: 'Never read', page: kind.page })
      if (watched.has(place.id)) live.count.of--
      else live.never++
      watched.add(place.id)
      continue
    }
    if (after(w.lastOkAt, start)) {
      live.count.read++
      continue
    }
    const why = after(w.lastRunAt, start) ? 'Didn’t load' : w.lastRunAt ? 'Not reached' : 'Never read'
    if (why === 'Didn’t load') live.failed++
    else if (why === 'Never read') live.never++
    else live.notReached++
    live.misses.push({ name: watchName(w), why, page: kind.page })
  }
  for (const u of unread) {
    if (watched.has(u.id)) continue
    live.count.of++
    live.never++
    live.misses.push({ name: u.name, why: 'Never read', page: kind.page })
  }
  live.misses = onePerPlace(live.misses)
  return live
}

/** A place's pages missed for the same reason, as one line: "Congregation
 *  Sons of Israel · 5 pages". */
function onePerPlace(misses: readonly KindMiss[]): KindMiss[] {
  const lines = new Map<string, { miss: KindMiss; pages: number }>()
  for (const m of misses) {
    const key = `${m.name}\n${m.why}\n${m.page}`
    const line = lines.get(key)
    if (line) line.pages++
    else lines.set(key, { miss: m, pages: 1 })
  }
  return [...lines.values()].map(({ miss, pages }) => (pages > 1 ? { ...miss, name: `${miss.name} · ${pages} pages` } : miss))
}

/** A listing Google is asked about, as the Google page has it. */
export type GoogleLive = { name: string; matched: boolean; failedAt: string | null; readAt?: string | null }

function liveGoogle(kind: NightKind, places: readonly GoogleLive[], start: number): Live {
  const matched = places.filter((p) => p.matched)
  const failed = matched.filter((p) => after(p.failedAt, start))
  return {
    count: { of: matched.length, read: matched.length - failed.length },
    misses: failed.map((p) => ({ name: p.name, why: 'Didn’t load', page: kind.page })),
    failed: failed.length,
    never: 0,
    notReached: 0,
  }
}

const byNeed = (a: TrackedSource, b: TrackedSource) => Number(b.bad) - Number(a.bad) || a.name.localeCompare(b.name)

function watchStatus(w: Watch): Omit<TrackedSource, 'name' | 'page'> & { at: number } {
  if (w.failingSince) return { status: `Not loading since ${dayName(Date.parse(w.failingSince))}`, bad: true, at: 0 }
  if (w.lastOkAt) return { status: `Read ${dayName(Date.parse(w.lastOkAt))}`, bad: false, at: Date.parse(w.lastOkAt) }
  return { status: 'Not read yet', bad: false, at: 0 }
}

/** Every page a kind reads, a line per place ("· 5 pages"): one not
 *  loading first, else its latest read. Menus: a place whose menu was
 *  never read says so, watched or not. A watch not active is a record
 *  (a page stopped, a search), not tracked. A place's own website says
 *  why it's read first: "Not on Google · Read Oct 24". */
function trackedWatches(kind: NightKind, watches: readonly Watch[], unread: readonly UnreadMenu[], readsOf?: ReadsOf, siteGap?: SiteGap): TrackedSource[] {
  const neverRead = new Map(unread.map((u) => [u.id, u]))
  const places = new Map<string, { name: string; pages: number; best: ReturnType<typeof watchStatus> }>()
  for (const w of watches) {
    if (!w.active || nightKindOf(w, readsOf, siteGap) !== kind.id) continue
    const place = w.resourceId ? neverRead.get(w.resourceId) : undefined
    const status = place ? { status: 'Menu never read', bad: true, at: 0 } : watchStatus(w)
    const key = w.resourceId ?? w.id
    const line = places.get(key)
    if (!line) places.set(key, { name: place?.name ?? watchName(w), pages: 1, best: status })
    else {
      line.pages++
      if ((status.bad && !line.best.bad) || (status.bad === line.best.bad && status.at > line.best.at)) line.best = status
    }
  }
  const tracked = [...places.entries()].map(([key, { name, pages, best }]) => {
    const why = kind.id === 'sites' ? siteGap?.(key) : null
    return { name: pages > 1 ? `${name} · ${pages} pages` : name, status: why ? `${why} · ${best.status}` : best.status, bad: best.bad, page: kind.page }
  })
  for (const u of unread) if (!places.has(u.id)) tracked.push({ name: u.name, status: 'Menu never read', bad: true, page: kind.page })
  return tracked.sort(byNeed)
}

function trackedGoogle(kind: NightKind, places: readonly GoogleLive[]): TrackedSource[] {
  return places
    .filter((p) => p.matched)
    .map((p) =>
      p.failedAt
        ? { name: p.name, status: `Not answering since ${dayName(Date.parse(p.failedAt))}`, bad: true, page: kind.page }
        : { name: p.name, status: p.readAt ? `Read ${dayName(Date.parse(p.readAt))}` : 'Not read yet', bad: false, page: kind.page },
    )
    .sort(byNeed)
}

/** Newsletters: every sender linked to a place, or waiting to be. One not
 *  linked is a miss the tab links in place; so is one gone quiet for a
 *  month (the run's quietError) or one that couldn't be read. */
function newsletterView(kind: NightKind, watches: readonly Watch[], listings?: ListingInfo): NightKindView {
  // A sender not linked yet waits inactive until it is (newsletter.ts).
  const own = watches.filter((w) => (w.active || !w.resourceId) && isNewsletterWatch(w) && !isIgnoredSender(w))
  const tracked: (TrackedSource & { link?: string })[] = own.map((w) => {
    const name = (w.resourceId && listings?.nameOf(w.resourceId)) || watchName(w).replace(/^mailto:/, '')
    const page = w.resourceId && listings?.readsOf(w.resourceId) === 'times' ? 'times' : ''
    const day = (iso: string) => dayName(Date.parse(iso))
    if (!w.resourceId) return { name, status: 'Not linked to a shul', bad: true, page: '', link: w.id }
    if (w.failingSince && /^No newsletter/.test(w.lastError ?? '')) return { name, status: w.pageChangedAt ? `No email since ${day(w.pageChangedAt)}` : 'No email since it was linked', bad: true, page }
    if (w.failingSince) return { name, status: 'Couldn’t read the last one', bad: true, page }
    return { name, status: w.pageChangedAt ? `Email ${day(w.pageChangedAt)}` : 'No email yet', bad: false, page }
  })
  const n = (status: RegExp) => tracked.filter((t) => t.bad && status.test(t.status)).length
  const latest = own.map((w) => w.pageChangedAt).filter((d): d is string => !!d).sort().pop()
  const trouble = [n(/^Not linked/) && `${n(/^Not linked/)} to link`, n(/^No email/) && `${n(/^No email/)} quiet for a month`, n(/^Couldn/) && `${n(/^Couldn/)} couldn’t be read`].filter(Boolean).join(' · ') || null
  return {
    id: kind.id,
    name: kind.name,
    about: kind.about,
    when: null,
    count: own.length ? `${own.length} newsletter${own.length === 1 ? '' : 's'}${latest ? ` · last email ${dayName(Date.parse(latest))}` : ''}` : 'None yet',
    trouble,
    misses: tracked.filter((t) => t.bad).map((t) => ({ name: t.name, why: t.status, page: t.page, ...(t.link ? { link: t.link } : {}) })),
    tracked: tracked.map(({ name, status, bad, page }) => ({ name, status, bad, page })).sort(byNeed),
    nights: [],
  }
}

function troubleOf(live: Live, ranOut: boolean): string | null {
  const parts = [live.failed && `${live.failed} didn’t load`, live.never && `${live.never} never read`, live.notReached && (ranOut ? 'ran out of time' : `${live.notReached} not reached`)]
  return parts.filter(Boolean).join(' · ') || null
}

/** What's wrong with the read-menus job, said after Menus' count. */
function newMenusTrouble(runs: readonly JobRun[], now: number): string | null {
  const health = jobHealth(NIGHTLY_JOBS.find((j) => j.id === 'read-menus')!, runs, now)
  if (health.state === 'failed') return 'reading new menus failed'
  if (health.state === 'cut off') return 'reading new menus stopped before it finished'
  if (health.state === 'late') return `reading new menus didn’t run since ${dayName(Date.parse(health.since))}`
  if (health.state === 'warning' && /^Not set up/.test(health.warning)) return 'reading new menus isn’t set up'
  return null
}

/** Each kind's line for one community. `runs`: each job's, newest first.
 *  `unread`: the food places whose menu was never read. */
export function nightKinds(
  community: string,
  runs: Partial<Record<JobId, readonly JobRun[]>>,
  watches: readonly Watch[],
  google: readonly GoogleLive[],
  now: number,
  unread: readonly UnreadMenu[] = [],
  listings?: ListingInfo,
): NightKindView[] {
  const readsOf = listings?.readsOf
  const siteGap = listings?.siteGap
  const views = NIGHT_KINDS.map((kind): NightKindView => {
    if (!kind.job) return newsletterView(kind, watches, listings)
    const job = NIGHTLY_JOBS.find((j) => j.id === kind.job)!
    const own = runs[kind.job] ?? []
    const last = own[0]
    const tracked = kind.id === 'google' ? trackedGoogle(kind, google) : trackedWatches(kind, watches, kind.id === 'menus' ? unread : [], readsOf, siteGap)
    const base = { id: kind.id, name: kind.name, about: kind.about, tracked, nights: kindNights(kind, community, own, now, kind.id === 'menus' ? (runs['read-menus'] ?? []) : []) }
    const health = jobHealth(job, own, now)
    if (!last || health.state === 'never') return { ...base, when: null, count: 'Not run yet', trouble: null, misses: [] }
    const when = timeOf(last.startedAt)
    if (health.state === 'late') return { ...base, when, count: `Didn’t run since ${dayName(Date.parse(health.since))}`, trouble: null, misses: [] }
    if (health.state === 'running') return { ...base, when, count: 'Running now', trouble: null, misses: [] }
    if (health.state === 'failed') return { ...base, when, count: 'Failed', trouble: health.error, misses: [] }
    const start = Date.parse(last.startedAt)
    const live = kind.id === 'google' ? liveGoogle(kind, google, start) : liveWatches(kind, watches, start, kind.id === 'menus' ? unread : [], readsOf, siteGap)
    const count = live.count.of ? countLine(kind, live.count) : 'Nothing to read'
    const also = kind.id === 'menus' ? newMenusTrouble(runs['read-menus'] ?? [], now) : null
    const trouble = [health.state === 'cut off' && 'stopped before it finished', troubleOf(live, !!last.warning), also].filter(Boolean).join(' · ') || null
    return { ...base, when, count, trouble, misses: live.misses }
  })
  return views.filter((v) => (v.id !== 'other' && v.id !== 'sites') || v.tracked.length)
}

/** Not all read: something missed, or its run didn't run or failed. */
export const kindBad = (k: Pick<NightKindView, 'trouble' | 'count'>) => !!k.trouble || /^(Didn’t run|Failed)/.test(k.count)

/** The closed row's line: "Everything read", or which kinds need a look. */
export function lastNightLine(kinds: readonly Pick<NightKindView, 'name' | 'trouble' | 'count'>[]): { good: boolean; text: string } {
  const bad = kinds.filter(kindBad).map((k, i) => (i ? k.name.toLowerCase() : k.name))
  if (!bad.length) return { good: true, text: 'Everything read' }
  const list = bad.length === 1 ? bad[0] : `${bad.slice(0, -1).join(', ')} and ${bad[bad.length - 1]}`
  return { good: false, text: `${list} need${bad.length === 1 && !/s$/.test(bad[0]) ? 's' : ''} a look` }
}
