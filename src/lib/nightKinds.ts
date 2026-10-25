import { jobHealth, NIGHTLY_JOBS, type JobId, type JobRun, type KindCount, type NightKindId, type RunKinds } from './jobRuns'
import { watchGroupOf } from './watchGroups'
import { isIgnoredSender, isNewsletterWatch } from './newsletter'
import { isEruvWebsiteWatch } from './eruvWebsite'
import type { Watch } from './watches'

// ── Nightly runs, a line per kind of source (Oct 25) ────────────────────────
// The Watches tab's "Last night" (FinalNightly): Google, Kosher
// certification, Hospitals, Eruvs, Minyan times, Websites and Menus, each
// its run's time and what was read. Google is the 2 AM job of its own; the
// rest are all the 3 AM watches run, which stays one job (the user, Oct
// 24). Last night is worked out from the sources as they are now (each
// watch's last read, each listing's last Google answer), so a source read
// again since stops showing as missed. The nights before need what each
// run read, so each run saves its count per community and kind
// (job_run.kinds, migration 087). Read-menus and walks have no line.
// Pure: the runs route works it out, NightlyRuns.tsx draws it.

export type NightKind = {
  id: NightKindId
  name: string
  job: JobId
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
  { id: 'websites', name: 'Websites', job: 'watches', about: 'Reads every other page a place keeps, a mikvah’s hours among them.', page: '' },
  { id: 'menus', name: 'Menus', job: 'watches', about: 'Reads each food place’s menu when it changes.', page: 'dishes' },
]

type KindWatch = Pick<Watch, 'kind' | 'url' | 'createdBy' | 'label' | 'resourceId'>

/** A watch's kind, or null for a newsletter: read as each email comes in,
 *  not at night. */
export function nightKindOf(w: KindWatch): Exclude<NightKindId, 'google'> | null {
  if (isNewsletterWatch(w) || isIgnoredSender(w)) return null
  if (isEruvWebsiteWatch(w)) return 'eruvs'
  const group = watchGroupOf(w as Watch)
  return group === 'kosher' ? 'kosher' : group === 'hospital' ? 'hospitals' : group === 'menu' ? 'menus' : group === 'times' ? 'times' : 'websites'
}

function add(kinds: RunKinds, community: string, kind: NightKindId, read: boolean) {
  const own = (kinds[community] ??= {})
  const count = (own[kind] ??= { of: 0, read: 0 })
  count.of++
  if (read) count.read++
}

/** What the watches run read: `queue`, every watch it meant to; `read`,
 *  the ids of those it read. */
export function countWatchKinds(queue: readonly (KindWatch & Pick<Watch, 'id' | 'communityId'>)[], read: ReadonlySet<string>): RunKinds {
  const kinds: RunKinds = {}
  for (const w of queue) {
    const kind = nightKindOf(w)
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

export type KindMiss = { name: string; why: string; page: string }
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

/** Its last 14 nights, newest first: from the first night recorded, and
 *  today only once it has run. */
export function kindNights(kind: NightKind, community: string, runs: readonly JobRun[], now: number): KindNight[] {
  if (!runs.length) return []
  const byDay = new Map<string, JobRun>()
  for (const r of runs) if (!byDay.has(dayKey(Date.parse(r.startedAt)))) byDay.set(dayKey(Date.parse(r.startedAt)), r)
  const first = dayKey(Date.parse(runs[runs.length - 1].startedAt))
  const nights: KindNight[] = []
  for (let i = 0; i < 14; i++) {
    const t = now - i * 86_400_000
    const key = dayKey(t)
    if (key < first) break
    const run = byDay.get(key)
    if (!run && i === 0) continue
    nights.push({ date: dayName(t), ...(run ? nightResult(kind, community, run, run === runs[0]) : { result: 'Didn’t run', tone: 'bad' as const }) })
  }
  return nights
}

/** A watch's name on the tab: a listing's page by its place's name
 *  ("Beth Am · davening times on their website"). */
const watchName = (w: Pick<Watch, 'label' | 'url'>) => w.label?.split(' · ')[0] || w.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')

type Live = { count: KindCount; misses: KindMiss[]; failed: number; never: number; notReached: number }

function liveWatches(kind: NightKind, watches: readonly Watch[], start: number): Live {
  const own = watches.filter((w) => w.active && Date.parse(w.createdAt) < start && nightKindOf(w) === kind.id)
  const live: Live = { count: { of: own.length, read: 0 }, misses: [], failed: 0, never: 0, notReached: 0 }
  for (const w of own) {
    if (after(w.lastOkAt, start)) {
      live.count.read++
      continue
    }
    const why = after(w.lastRunAt, start) ? 'Didn’t load' : w.lastRunAt ? 'Not reached' : 'Never read'
    if (why === 'Didn’t load') live.failed++
    else if (why === 'Never read') live.never++
    else live.notReached++
    const page = kind.id === 'websites' && / hours on their website$/.test(w.label ?? '') ? 'hours' : kind.page
    live.misses.push({ name: watchName(w), why, page })
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
export type GoogleLive = { name: string; matched: boolean; failedAt: string | null }

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

function troubleOf(live: Live, ranOut: boolean): string | null {
  const parts = [live.failed && `${live.failed} didn’t load`, live.never && `${live.never} never read`, live.notReached && (ranOut ? 'ran out of time' : `${live.notReached} not reached`)]
  return parts.filter(Boolean).join(' · ') || null
}

/** Each kind's line for one community. `runs`: each job's, newest first. */
export function nightKinds(community: string, runs: Partial<Record<JobId, readonly JobRun[]>>, watches: readonly Watch[], google: readonly GoogleLive[], now: number): NightKindView[] {
  return NIGHT_KINDS.map((kind) => {
    const job = NIGHTLY_JOBS.find((j) => j.id === kind.job)!
    const own = runs[kind.job] ?? []
    const last = own[0]
    const base = { id: kind.id, name: kind.name, about: kind.about, nights: kindNights(kind, community, own, now) }
    const health = jobHealth(job, own, now)
    if (!last || health.state === 'never') return { ...base, when: null, count: 'Not run yet', trouble: null, misses: [] }
    const when = timeOf(last.startedAt)
    if (health.state === 'late') return { ...base, when, count: `Didn’t run since ${dayName(Date.parse(health.since))}`, trouble: null, misses: [] }
    if (health.state === 'running') return { ...base, when, count: 'Running now', trouble: null, misses: [] }
    if (health.state === 'failed') return { ...base, when, count: 'Failed', trouble: health.error, misses: [] }
    const start = Date.parse(last.startedAt)
    const live = kind.id === 'google' ? liveGoogle(kind, google, start) : liveWatches(kind, watches, start)
    const count = live.count.of ? countLine(kind, live.count) : 'Nothing to read'
    if (health.state === 'cut off') return { ...base, when, count, trouble: 'stopped before it finished', misses: live.misses }
    return { ...base, when, count, trouble: troubleOf(live, !!last.warning), misses: live.misses }
  })
}

/** Not all read: something missed, or its run didn't run or failed. */
export const kindBad = (k: Pick<NightKindView, 'trouble' | 'count'>) => !!k.trouble || /^(Didn’t run|Failed)/.test(k.count)

/** The closed row's line: "Everything read", or which kinds weren't. */
export function lastNightLine(kinds: readonly Pick<NightKindView, 'name' | 'trouble' | 'count'>[]): { good: boolean; text: string } {
  const bad = kinds.filter(kindBad).map((k, i) => (i ? k.name.toLowerCase() : k.name))
  if (!bad.length) return { good: true, text: 'Everything read' }
  const list = bad.length === 1 ? bad[0] : `${bad.slice(0, -1).join(', ')} and ${bad[bad.length - 1]}`
  return { good: false, text: `${list} not all read` }
}
