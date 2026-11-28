import type { NightKindId } from './jobRuns'
import type { NightKindView } from './nightKinds'
import type { PlaceCoverage } from './fieldCoverage'

// ── Watches, by what visitors see (tracker 108, boards L1–L2i, Nov 28) ──────
// The list is grouped under what a visitor would look for (Every place,
// Shuls, Food…), one row per job, named for what it keeps current. A row is
// its name, and on the right "Off" or "Runs when…" when it isn't running;
// a search finds a job by its name or a source it reads ("Google").
//
// Some jobs here are two nightly jobs: Basic information is Google and a
// place's own website (when Google hasn't got it), Minyan times is the
// shuls' websites and their newsletters. The switch turns both.

export type WatchSourceKey = 'google' | 'website' | 'newsletter' | 'refuah' | `list:${string}`

export type WatchJob = {
  /** Its page (watches/job/<id>): the first nightly job it is. */
  id: NightKindId
  kinds: readonly NightKindId[]
  heading: string
  name: string
  /** Its line, under the switch. */
  line: string
  /** With nothing read yet and never run. */
  runsWhen: string
  /** What it reads, under From; none for a job with one kind of source. */
  from: readonly { key: WatchSourceKey; label: string }[]
  /** Words a search also finds it by. */
  also: readonly string[]
}

const FIRST_PLACE = 'Runs when the first place is added'

export const WATCH_JOBS: readonly WatchJob[] = [
  {
    id: 'google',
    kinds: ['google', 'sites'],
    heading: 'Every place',
    name: 'Basic information',
    line: 'Its name, hours, phone and website, and whether it’s open. From Google, or the place’s own website when Google doesn’t have it.',
    runsWhen: FIRST_PLACE,
    from: [
      { key: 'google', label: 'Google' },
      { key: 'website', label: 'Its own website' },
    ],
    also: ['Google', 'Website'],
  },
  {
    id: 'times',
    kinds: ['times', 'newsletters'],
    heading: 'Shuls',
    name: 'Minyan times',
    line: 'From each shul’s website or newsletter.',
    runsWhen: 'Runs once the first shul has a website or newsletter',
    from: [
      { key: 'website', label: 'Website' },
      { key: 'newsletter', label: 'Newsletter' },
    ],
    also: ['Website', 'Newsletter', 'Email'],
  },
  { id: 'menus', kinds: ['menus'], heading: 'Food', name: 'Menus', line: 'From each place’s menu page, a few every night.', runsWhen: FIRST_PLACE, from: [], also: ['Website'] },
  { id: 'kosher', kinds: ['kosher'], heading: 'Food', name: 'Kosher certification', line: 'From each kosher agency’s list, every night.', runsWhen: 'Runs when a kosher list is added', from: [], also: ['Hechsher', 'List'] },
  { id: 'hours', kinds: ['hours'], heading: 'Mikvahs', name: 'Mikvah hours', line: 'From each mikvah’s website, every night.', runsWhen: FIRST_PLACE, from: [], also: ['Website'] },
  { id: 'hospitals', kinds: ['hospitals'], heading: 'Hospitals', name: 'Bikkur Cholim details', line: 'From each hospital’s page on Refuah, every night.', runsWhen: 'Runs when the first hospital is added', from: [], also: ['Refuah'] },
  { id: 'eruvs', kinds: ['eruvs'], heading: 'Eruv', name: 'Eruv status', line: 'From the eruv’s website and emails.', runsWhen: FIRST_PLACE, from: [], also: ['Website', 'Email'] },
  { id: 'links', kinds: ['links'], heading: 'Links', name: 'Broken links', line: 'Opens every link nothing else reads, every Sunday.', runsWhen: FIRST_PLACE, from: [], also: [] },
  // Pages added by hand: listed only when there are some.
  { id: 'other', kinds: ['other'], heading: 'Links', name: 'Other pages', line: 'Pages added by hand. What they find waits on To do.', runsWhen: '', from: [], also: [] },
]

/** The job a nightly job is part of: Shul emails is Minyan times. */
export function watchJobOf(kind: string): WatchJob | undefined {
  return WATCH_JOBS.find((j) => (j.kinds as readonly string[]).includes(kind))
}

/** Its sources, the kosher lists being each a source of their own. */
export function watchSources(job: WatchJob, views: readonly NightKindView[]): { key: WatchSourceKey; label: string }[] {
  if (job.id !== 'kosher') return [...job.from]
  const names = [...new Set(views.find((v) => v.id === 'kosher')?.tracked.map((t) => t.name) ?? [])]
  return names.map((n) => ({ key: `list:${n}` as const, label: n }))
}

export type WatchState =
  /** Running; `trouble` when the job itself isn't (late, failed). */
  | { state: 'on'; trouble: string | null }
  | { state: 'off'; lastAt: string | null }
  | { state: 'new' }

/** Where a job stands: off when every nightly job in it is off; new with
 *  nothing read and no run yet. */
export function watchState(job: WatchJob, views: readonly NightKindView[], off: readonly NightKindId[]): WatchState {
  const mine = views.filter((v) => job.kinds.includes(v.id))
  const last = mine.map((v) => v.lastAt).filter((t): t is string => !!t).sort().at(-1) ?? null
  if (job.kinds.every((k) => off.includes(k))) return { state: 'off', lastAt: last }
  if (!last && !mine.some((v) => v.tracked.length)) return { state: 'new' }
  const whole = mine.flatMap((v) => v.fixes).find((f) => f.whole)
  return { state: 'on', trouble: whole?.why ?? null }
}

/** "Nov 27", in the community's time. */
export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

/** What a list row says on its right: nothing when it's running well. */
export function watchAside(job: WatchJob, s: WatchState): { text: string; bad: boolean } | null {
  if (s.state === 'off') return { text: 'Off', bad: false }
  if (s.state === 'new') return { text: job.runsWhen, bad: false }
  return s.trouble ? { text: s.trouble, bad: true } : null
}

/** The jobs to list: Other pages only when it has some. */
export function listedJobs(views: readonly NightKindView[]): WatchJob[] {
  return WATCH_JOBS.filter((j) => j.id !== 'other' || !!views.find((v) => v.id === 'other')?.tracked.length)
}

/** A search: a job by its name or heading, or one reading a source by
 *  that source ("Google" finds Basic information, "From Google"). */
export function findWatches(query: string, jobs: readonly WatchJob[], views: readonly NightKindView[]): { job: WatchJob; line: string | null }[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (s: string) => s.toLowerCase().includes(q)
  const out: { job: WatchJob; line: string | null }[] = []
  for (const job of jobs) {
    if (has(job.name) || has(job.heading)) {
      out.push({ job, line: null })
      continue
    }
    const source = watchSources(job, views).find((s) => has(s.label)) ?? job.also.map((a) => ({ label: a })).find((s) => has(s.label))
    if (source) out.push({ job, line: `From ${source.label === 'Its own website' ? 'its own website' : source.label}` })
  }
  return out
}

// ── Places' Watch and Source menus (board L1, l05, l06) ─────────────────────
// A place is narrowed by the jobs that check something on it and where they
// read it from, the same words Watches uses: Basic information, From Google.
// Nothing is a place with something no job checks.

/** The jobs checking something on a place, in Watches' order, and where
 *  they read it from. A website reading a shul's times is Minyan times; one
 *  reading a phone or the hours, when Google hasn't got them, is Hours and
 *  phone. */
export function placeWatches(c: Pick<PlaceCoverage, 'fields' | 'lists'>): { jobs: NightKindId[]; sources: WatchSourceKey[] } {
  const jobs = new Set<NightKindId>()
  const sources = new Set<WatchSourceKey>()
  for (const f of c.fields) {
    for (const by of f.by) {
      if (by === 'google') {
        jobs.add('google')
        sources.add('google')
      } else if (by === 'website') {
        jobs.add(f.key === 'times' ? 'times' : f.key === 'menu' ? 'menus' : f.key === 'hours' && f.main ? 'hours' : 'google')
        sources.add('website')
      } else if (by === 'newsletter') {
        jobs.add('times')
        sources.add('newsletter')
      } else if (by === 'certifier') {
        jobs.add('kosher')
        for (const l of c.lists) sources.add(`list:${l}`)
      } else if (by === 'refuah') {
        jobs.add('hospitals')
        sources.add('refuah')
      } else if (by === 'links') jobs.add('links')
    }
  }
  return { jobs: WATCH_JOBS.filter((j) => jobs.has(j.id)).map((j) => j.id), sources: [...sources] }
}

/** "Basic information · Minyan times". */
export const placeWatchLine = (jobs: readonly NightKindId[]) => jobs.map((id) => WATCH_JOBS.find((j) => j.id === id)?.name ?? id).join(' · ')

/** The Watch menu: every place, a place with something nothing checks, or
 *  a job's. */
export type PlaceWatchChoice = 'any' | 'nothing' | NightKindId
export const isPlaceWatchChoice = (v: unknown): v is PlaceWatchChoice => v === 'any' || v === 'nothing' || WATCH_JOBS.some((j) => j.id === v)

/** The Source menu: every place, or one read from this. */
export type PlaceSourceChoice = 'any' | WatchSourceKey
const SOURCE_LABELS: Record<string, string> = { google: 'Google', website: 'Website', newsletter: 'Newsletter', refuah: 'Refuah' }
export const isPlaceSourceChoice = (v: unknown): v is PlaceSourceChoice => typeof v === 'string' && (v === 'any' || v in SOURCE_LABELS || (v.startsWith('list:') && v.length > 5))
/** "Google", "KCL’s list". */
export const sourceLabel = (key: WatchSourceKey) => (key.startsWith('list:') ? key.slice(5) : SOURCE_LABELS[key])

/** The Source menu's choices, in the drawn order: Google, Website,
 *  Newsletter, each kosher list, Refuah. */
export function sourceChoices(keys: Iterable<WatchSourceKey>): WatchSourceKey[] {
  const all = [...new Set(keys)]
  const rank = (k: WatchSourceKey) => (k.startsWith('list:') ? 3 : ['google', 'website', 'newsletter', '', 'refuah'].indexOf(k))
  return all.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** What a place shows the menus: its jobs and sources, and whether
 *  something on it goes unchecked. */
export type PlaceWatched = { jobs: readonly NightKindId[]; sources: readonly WatchSourceKey[]; unchecked: boolean }

export function fitsPlaceWatch(w: PlaceWatched | undefined, watch: PlaceWatchChoice, source: PlaceSourceChoice): boolean {
  if (watch !== 'any' && (!w || (watch === 'nothing' ? !w.unchecked : !w.jobs.includes(watch)))) return false
  if (source !== 'any' && (!w || !w.sources.includes(source))) return false
  return true
}
