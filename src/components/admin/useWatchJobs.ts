'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import type { CategoryConfig } from '@/lib/categories'
import type { GooglePlace } from '@/lib/googleJob'
import type { Watch } from '@/lib/watches'
import type { Finding } from '@/lib/watchFindings'
import { menusReading, type DishPlace, type JobCounts } from '@/lib/watchJobs'
import type { SitePlace } from '@/lib/watchPlaces'
import type { EruvJobLoaded } from '@/lib/eruvJob'
import type { LinkStanding } from '@/lib/linkCheck'
import type { Hospital } from './watchJobTypes'
import type { HoursPlace } from './watchJobTypes'
import type { KosherLoaded } from './watchJobTypes'
import type { AdminPlace } from '@/lib/adminPlaces'
import type { NightKindId } from '@/lib/jobRuns'
import type { LookAgainLoaded } from '@/lib/lookAgain'
import { placeTroubles } from '@/lib/watchPlaces'
import { placeCoverage, type CoverageIn, type PlaceCoverage } from '@/lib/fieldCoverage'
import type { NightlyRunsLoaded } from './JobPage'

// Every job's places, as the Watches tab and its pages by kind of place
// read them (watchPlaces.ts). Each fills in as its own read comes back,
// and one that fails keeps what it last showed. Kept per community, so
// going back to the tab shows what it showed while it reads again.

export type PagesJob = { name: string; places: HoursPlace[] } | null
/** Each job's, as loaded: undefined while it's still loading, null when it
 *  couldn't be. */
export type Jobs = {
  categories?: CategoryConfig[] | null
  dishes?: (DishPlace & { id: string; name: string; href: string; pages?: Watch[] })[] | null
  hospitals?: Hospital[] | null
  hours?: PagesJob
  times?: PagesJob
  /** The places whose own website is read, with no job page of their own. */
  sites?: (SitePlace & { findings?: Finding[] })[] | null
  eruvim?: EruvJobLoaded | null
  kosher?: KosherLoaded | null
  google?: { counts: JobCounts; places: GooglePlace[] } | null
  /** The weekly link check's: every link a listing shows that it opens. */
  links?: LinkStanding[] | null
  runs?: NightlyRunsLoaded | null
  /** Every listing, for what checks each of its fields (fieldCoverage.ts). */
  places?: AdminPlace[] | null
  /** Look again's: what it tries, and what it found (lookAgain.ts). */
  lookAgain?: LookAgainLoaded | null
}

/** What's gone wrong with a check of each place; a job turned off has none. */
export function troublesOf(jobs: Jobs, now: number): Map<string, string[]> {
  const off = jobs.runs?.off ?? []
  const unless = <T,>(kind: NightKindId, list: T | null | undefined) => (off.includes(kind) ? null : (list ?? null))
  return placeTroubles(
    {
      google: unless('google', jobs.google?.places),
      dishes: unless('menus', jobs.dishes),
      hours: unless('hours', jobs.hours?.places),
      times: unless('times', jobs.times?.places),
      sites: unless('sites', jobs.sites),
      hospitals: unless('hospitals', jobs.hospitals),
      links: unless('links', jobs.links),
    },
    now,
  )
}

/** What checks each listing on the site, once every job has answered; a job
 *  that didn't load counts as checking nothing, so jobsNotLoaded says so. */
export function coverageOf(jobs: Jobs): Map<string, PlaceCoverage> | null {
  if (!jobs.categories || !jobs.places || !jobsSettled(jobs)) return null
  const input: CoverageIn = {
    google: jobs.google?.places ?? null,
    times: jobs.times?.places ?? null,
    hours: jobs.hours?.places ?? null,
    sites: jobs.sites ?? null,
    dishes: jobs.dishes ?? null,
    hospitals: jobs.hospitals ?? null,
    kosher: jobs.kosher?.places ?? null,
    links: jobs.links ?? null,
    off: jobs.runs?.off ?? [],
  }
  const categories = new Map(jobs.categories.map((c) => [c.id, c]))
  const out = new Map<string, PlaceCoverage>()
  for (const p of jobs.places) {
    const category = categories.get(p.category)
    if (p.status === 'approved' && category) out.set(p.id, placeCoverage(p.listing as unknown as Record<string, unknown> & { id: string }, category, input))
  }
  return out
}

const lastSeen = new Map<string, Jobs>()

/** A job just turned off or on, as the server confirmed: what Watches
 *  shows on its way there. It shows what it last saw, then reads again,
 *  and the job's own read (runs) is the slowest of them, so it showed the
 *  job as it was for seconds (PR 390's CI, Nov 16: Links still listed). */
export function noteJobSwitched(community: string, kind: NightKindId, off: boolean) {
  const seen = lastSeen.get(community)
  if (!seen?.runs) return
  const others = (seen.runs.off ?? []).filter((k) => k !== kind)
  lastSeen.set(community, { ...seen, runs: { ...seen.runs, off: off ? [...others, kind] : others } })
}

/** For tests: start each one with nothing seen. */
export function forgetWatchJobs() {
  lastSeen.clear()
}

/** All of them have come back, or failed. */
export function jobsSettled(jobs: Jobs, keys: readonly (keyof Jobs)[] = ['categories', 'dishes', 'hospitals', 'hours', 'times', 'sites', 'eruvim', 'kosher', 'google', 'links']): boolean {
  return keys.every((k) => jobs[k] !== undefined)
}

/** How often a screen asks again while a menu is being read (the route
 *  reads it after its reply, Nov 2). Its read takes 15–40s. */
export const MENU_READING_POLL_MS = 6000

/** The food places alone, read again: null if they couldn't be. */
export function loadDishes(token: string, community: string): Promise<Jobs['dishes'] | null> {
  return fetchJson<{ places: Jobs['dishes'] }>(withCommunity('/api/admin/main-dishes', community), { headers: { Authorization: `Bearer ${token}` } }, '')
    .then((d) => d.places ?? null)
    .catch(() => null)
}

/** Every job's places, each handed over as it comes in. */
type JobKey = keyof Jobs
type Read = { path: string; take: (d: never) => unknown }
const job = (j: { name: string; places: HoursPlace[] }): PagesJob => (j.places ? { name: j.name, places: j.places } : null)
/** Each job's read, and what it keeps of the answer (null: couldn't). */
const READS: { [K in JobKey]-?: { path: string; take: (d: never) => Jobs[K] | undefined } } = {
  categories: { path: '/api/admin/categories', take: (d: { categories?: CategoryConfig[] }) => d.categories ?? null },
  dishes: { path: '/api/admin/main-dishes', take: (d: { places?: Jobs['dishes'] }) => d.places ?? null },
  hospitals: { path: '/api/admin/watches/hospitals?counts', take: (d: { hospitals?: Hospital[] }) => d.hospitals ?? null },
  hours: { path: '/api/admin/watches/hours?counts', take: (d: { name: string; places: HoursPlace[] }) => job(d) },
  times: { path: '/api/admin/watches/hours?counts&job=times', take: (d: { name: string; places: HoursPlace[] }) => job(d) },
  sites: { path: '/api/admin/watches/sites', take: (d: { places?: Jobs['sites'] }) => d.places ?? null },
  eruvim: { path: '/api/admin/watches/eruv', take: (d: EruvJobLoaded) => (d.available ? d : null) },
  kosher: { path: '/api/admin/watches/kosher', take: (d: KosherLoaded) => (d.lists ? d : null) },
  google: { path: '/api/admin/watches/google', take: (d: { counts: JobCounts; places: GooglePlace[] }) => (d.places ? d : null) },
  links: { path: '/api/admin/watches/links', take: (d: { links?: LinkStanding[] }) => d.links ?? null },
  runs: { path: '/api/admin/watches/runs', take: (d: NightlyRunsLoaded) => (d.kinds ? d : null) },
  places: { path: '/api/admin/listings', take: (d: { places?: AdminPlace[] }) => d.places ?? null },
  // No items: failed, not empty.
  lookAgain: { path: '/api/admin/watches/look-again', take: (d: LookAgainLoaded) => (d.items ? d : undefined) },
}
export const ALL_JOBS = Object.keys(READS) as JobKey[]

/** The jobs a write to `path` can change: what a save waits to see again
 *  before it's done (the rest are read again behind it). Nothing known:
 *  every job. */
export function jobsChangedBy(path: string): JobKey[] {
  const p = path.split('?')[0]
  if (p.startsWith('/api/admin/main-dishes')) return ['dishes']
  if (p.startsWith('/api/admin/watches/google')) return ['google', 'places']
  if (p.startsWith('/api/admin/watches/hours')) return ['hours', 'times']
  if (p.startsWith('/api/admin/watches/sites')) return ['sites']
  if (p.startsWith('/api/admin/watches/links')) return ['links']
  if (p.startsWith('/api/admin/watches/eruv')) return ['eruvim']
  if (p.startsWith('/api/admin/watches/kosher')) return ['kosher']
  if (p.startsWith('/api/admin/watches/hospitals')) return ['hospitals']
  if (p.startsWith('/api/admin/watches/look-again')) return ['lookAgain']
  if (p === '/api/admin/watches') return ['runs']
  return ALL_JOBS
}

export async function loadJobs(token: string, community: string, fill: <K extends keyof Jobs>(key: K, value: Jobs[K]) => void, failed: (key: keyof Jobs) => void, keys: readonly JobKey[] = ALL_JOBS) {
  const headers = { Authorization: `Bearer ${token}` }
  await Promise.all(
    keys.map(async <K extends JobKey>(key: K) => {
      const read = READS[key] as Read
      const d = await fetchJson<never>(withCommunity(read.path, community), { headers }, '').catch(() => null)
      const value = d === null ? undefined : (read.take(d) as Jobs[K] | undefined)
      if (value === undefined) failed(key)
      else fill(key, value)
    }),
  )
}

/** And `reload`, for a page that acts on a place: every job read again.
 *  Given the jobs a save changed, it is done once those are back, and only
 *  then are the rest read, behind it. It used to wait for all thirteen,
 *  read at once and slowing each other down: a click on Accept showed
 *  "Saving…" for 4.4s on a laptop and over 5s in CI, where the admin
 *  tests failed on it all of Nov 16 (PR 389, PR 390).
 *
 *  `ready`: false holds the first read back until the screen's own data is
 *  in. Thirteen reads at once fill the browser's connections to the site
 *  (six, over HTTP/1.1), and a screen's own read waited behind them: Places
 *  still said Loading… after 5s in the admin tests (Nov 16). To do reads
 *  its jobs after its own data the same way (useTodo's loadWaiting). */
export function useWatchJobsAndReload(token: string, { ready = true }: { ready?: boolean } = {}): { jobs: Jobs; reload: (changed?: readonly JobKey[]) => Promise<void> } {
  const community = useCommunitySlug()
  const [jobs, setJobs] = useState<Jobs>(() => lastSeen.get(community) ?? {})

  const load = useCallback(async (given?: readonly JobKey[]) => {
    // Passed as a callback too (`.then(reload)`, onTried): anything but a
    // list of jobs is every job.
    const changed = Array.isArray(given) ? given : ALL_JOBS
    const fill = <K extends keyof Jobs>(key: K, value: Jobs[K]) => setJobs((j) => ({ ...j, [key]: value }))
    const failed = (key: keyof Jobs) => setJobs((j) => (j[key] === undefined ? { ...j, [key]: null } : j))
    await loadJobs(token, community, fill, failed, changed)
    const rest = ALL_JOBS.filter((k) => !changed.includes(k))
    if (rest.length) void loadJobs(token, community, fill, failed, rest)
  }, [token, community])

  useEffect(() => {
    lastSeen.set(community, jobs)
  }, [community, jobs])

  // A menu being read: its places asked for again until it's in.
  const reading = menusReading(jobs.dishes)
  useEffect(() => {
    if (!reading) return
    const t = setTimeout(() => void loadDishes(token, community).then((dishes) => dishes && setJobs((j) => ({ ...j, dishes }))), MENU_READING_POLL_MS)
    return () => clearTimeout(t)
  }, [reading, jobs.dishes, token, community])

  useLoadOnMount(useCallback(() => void (ready && load()), [load, ready]))
  return { jobs, reload: load }
}
