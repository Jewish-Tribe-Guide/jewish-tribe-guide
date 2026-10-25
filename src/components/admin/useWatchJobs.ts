'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import type { CategoryConfig } from '@/lib/categories'
import type { GooglePlace } from '@/lib/googleJob'
import type { DishPlace, JobCounts } from '@/lib/watchJobs'
import type { EruvJobLoaded } from '@/lib/eruvJob'
import type { Hospital } from './HospitalsJob'
import type { HoursPlace } from './HoursJob'
import type { KosherLoaded } from './KosherJob'
import type { NightlyRunsLoaded } from './NightlyRuns'

// Every job's places, as the Watches tab and its pages by kind of place
// read them (watchPlaces.ts). Each fills in as its own read comes back,
// and one that fails keeps what it last showed. Kept per community, so
// going back to the tab shows what it showed while it reads again.

export type PagesJob = { name: string; places: HoursPlace[] } | null
/** Each job's, as loaded: undefined while it's still loading, null when it
 *  couldn't be. */
export type Jobs = {
  categories?: CategoryConfig[] | null
  dishes?: (DishPlace & { id: string; name: string; href: string })[] | null
  hospitals?: Hospital[] | null
  hours?: PagesJob
  times?: PagesJob
  eruvim?: EruvJobLoaded | null
  kosher?: KosherLoaded | null
  google?: { counts: JobCounts; places: GooglePlace[] } | null
  runs?: NightlyRunsLoaded | null
}

const lastSeen = new Map<string, Jobs>()

/** For tests: start each one with nothing seen. */
export function forgetWatchJobs() {
  lastSeen.clear()
}

/** All of them have come back, or failed. */
export function jobsSettled(jobs: Jobs, keys: readonly (keyof Jobs)[] = ['categories', 'dishes', 'hospitals', 'hours', 'times', 'eruvim', 'kosher', 'google']): boolean {
  return keys.every((k) => jobs[k] !== undefined)
}

export function useWatchJobs(token: string): Jobs {
  const community = useCommunitySlug()
  const [jobs, setJobs] = useState<Jobs>(() => lastSeen.get(community) ?? {})

  const load = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` }
    const get = <T,>(path: string) => fetchJson<T>(withCommunity(path, community), { headers }, '').catch(() => null)
    const fill = <K extends keyof Jobs>(key: K, value: Jobs[K]) => setJobs((j) => ({ ...j, [key]: value }))
    const failed = (key: keyof Jobs) => setJobs((j) => (j[key] === undefined ? { ...j, [key]: null } : j))
    const job = (j: { name: string; places: HoursPlace[] }): PagesJob => (j.places ? { name: j.name, places: j.places } : null)
    void get<{ categories: CategoryConfig[] }>('/api/admin/categories').then((d) => (d ? fill('categories', d.categories ?? null) : failed('categories')))
    void get<{ places: Jobs['dishes'] }>('/api/admin/main-dishes').then((d) => (d ? fill('dishes', d.places ?? null) : failed('dishes')))
    void get<{ hospitals: Hospital[] }>('/api/admin/watches/hospitals?counts').then((d) => (d ? fill('hospitals', d.hospitals ?? null) : failed('hospitals')))
    void get<{ name: string; places: HoursPlace[] }>('/api/admin/watches/hours?counts').then((d) => (d ? fill('hours', job(d)) : failed('hours')))
    void get<{ name: string; places: HoursPlace[] }>('/api/admin/watches/hours?counts&job=times').then((d) => (d ? fill('times', job(d)) : failed('times')))
    void get<EruvJobLoaded>('/api/admin/watches/eruv').then((d) => (d ? fill('eruvim', d.available ? d : null) : failed('eruvim')))
    void get<KosherLoaded>('/api/admin/watches/kosher').then((d) => (d ? fill('kosher', d.lists ? d : null) : failed('kosher')))
    void get<{ counts: JobCounts; places: GooglePlace[] }>('/api/admin/watches/google').then((d) => (d ? fill('google', d.places ? d : null) : failed('google')))
    void get<NightlyRunsLoaded>('/api/admin/watches/runs').then((d) => (d ? fill('runs', d.jobs ? d : null) : failed('runs')))
  }, [token, community])

  useEffect(() => {
    lastSeen.set(community, jobs)
  }, [community, jobs])

  useLoadOnMount(load)
  return jobs
}
