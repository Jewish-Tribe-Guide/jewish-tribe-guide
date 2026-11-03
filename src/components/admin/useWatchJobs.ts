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
export async function loadJobs(token: string, community: string, fill: <K extends keyof Jobs>(key: K, value: Jobs[K]) => void, failed: (key: keyof Jobs) => void) {
  const headers = { Authorization: `Bearer ${token}` }
  const get = <T,>(path: string) => fetchJson<T>(withCommunity(path, community), { headers }, '').catch(() => null)
  const job = (j: { name: string; places: HoursPlace[] }): PagesJob => (j.places ? { name: j.name, places: j.places } : null)
  await Promise.all([
    get<{ categories: CategoryConfig[] }>('/api/admin/categories').then((d) => (d ? fill('categories', d.categories ?? null) : failed('categories'))),
    get<{ places: Jobs['dishes'] }>('/api/admin/main-dishes').then((d) => (d ? fill('dishes', d.places ?? null) : failed('dishes'))),
    get<{ hospitals: Hospital[] }>('/api/admin/watches/hospitals?counts').then((d) => (d ? fill('hospitals', d.hospitals ?? null) : failed('hospitals'))),
    get<{ name: string; places: HoursPlace[] }>('/api/admin/watches/hours?counts').then((d) => (d ? fill('hours', job(d)) : failed('hours'))),
    get<{ name: string; places: HoursPlace[] }>('/api/admin/watches/hours?counts&job=times').then((d) => (d ? fill('times', job(d)) : failed('times'))),
    get<{ places: Jobs['sites'] }>('/api/admin/watches/sites').then((d) => (d ? fill('sites', d.places ?? null) : failed('sites'))),
    get<EruvJobLoaded>('/api/admin/watches/eruv').then((d) => (d ? fill('eruvim', d.available ? d : null) : failed('eruvim'))),
    get<KosherLoaded>('/api/admin/watches/kosher').then((d) => (d ? fill('kosher', d.lists ? d : null) : failed('kosher'))),
    get<{ counts: JobCounts; places: GooglePlace[] }>('/api/admin/watches/google').then((d) => (d ? fill('google', d.places ? d : null) : failed('google'))),
    get<{ links: LinkStanding[] }>('/api/admin/watches/links').then((d) => (d ? fill('links', d.links ?? null) : failed('links'))),
    get<NightlyRunsLoaded>('/api/admin/watches/runs').then((d) => (d ? fill('runs', d.kinds ? d : null) : failed('runs'))),
    get<{ places: AdminPlace[] }>('/api/admin/listings').then((d) => (d ? fill('places', d.places ?? null) : failed('places'))),
    get<LookAgainLoaded>('/api/admin/watches/look-again').then((d) => (d?.items ? fill('lookAgain', d) : failed('lookAgain'))),
  ])
}

/** And `reload`, for a page that acts on a place: every job read again,
 *  done when they all are. */
export function useWatchJobsAndReload(token: string): { jobs: Jobs; reload: () => Promise<void> } {
  const community = useCommunitySlug()
  const [jobs, setJobs] = useState<Jobs>(() => lastSeen.get(community) ?? {})

  const load = useCallback(async () => {
    const fill = <K extends keyof Jobs>(key: K, value: Jobs[K]) => setJobs((j) => ({ ...j, [key]: value }))
    const failed = (key: keyof Jobs) => setJobs((j) => (j[key] === undefined ? { ...j, [key]: null } : j))
    await loadJobs(token, community, fill, failed)
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

  useLoadOnMount(load)
  return { jobs, reload: load }
}
