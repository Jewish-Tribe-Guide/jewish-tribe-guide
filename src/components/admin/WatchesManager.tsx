'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import type { Watch } from '@/lib/watches'
import type { ListingReads } from '@/lib/watchPurposes'
import { adminBase } from '@/lib/adminNav'
import { dishCounts, hospitalCounts, type JobCounts } from '@/lib/watchJobs'
import { eruvJobCounts } from '@/lib/eruvJob'
import { hoursCounts } from '@/lib/hoursJob'
import NightlyRuns from './NightlyRuns'
import WatchKinds from './WatchKinds'
import { forgetWatchJobs, useWatchJobsAndReload } from './useWatchJobs'

// ── The "Watches" tab (freshness map, Oct 5) ────────────────────────────────
// Everything the guide reads on its own to stay current: pages every
// morning, emails as they arrive, eruv statuses on Friday afternoon.
//
// Since Oct 25 the tab starts with a row per kind of place (WatchKinds.tsx,
// watchPlaces.ts), each opening its places in three tabs, then What's
// tracked: a line per kind of source, opening to everything it tracks
// (NightlyRuns.tsx, nightKinds.ts). That replaced the list of watches that
// was here (the user, Oct 25); a newsletter sender not linked to a shul is
// linked there. The job rows sit under "Job pages" until those pages hold
// all the jobs do. Pages are added from a place's own box (Add a source).

/** `job`: the job page where what's read for it waits ("Shul times"); none,
 *  the moderation queue. */
type Listing = { id: string; name: string; categoryLabel: string; reads: ListingReads; job?: string | null }
type Loaded = { available: boolean; watches: Watch[]; listings: Listing[] }
type Action = 'link' | 'ignore'
/** One job's row: what it is and its four counts; the whole row opens its
 *  page. Null counts: they couldn't be loaded; undefined, still loading.
 *  `pages` false: a job that loads no pages (Google), so no "didn't load". */
function JobRow({ href, name, about, counts, pages = true }: { href: string; name: string; about: string; counts: JobCounts | null | undefined; pages?: boolean }) {
  const stat = (n: number, label: string, flag: boolean) => (
    <span className="flex min-w-[4.5rem] flex-col">
      <span className={`text-base font-semibold ${flag && n > 0 ? 'text-amber-800' : 'text-slate-900'}`}>{n}</span>
      <span className="text-xs text-muted">{label}</span>
    </span>
  )
  return (
    <li>
      <Link href={href} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 hover:bg-slate-50" data-testid="job-row">
        <span className="min-w-[12rem] flex-1">
          <span className="block font-semibold text-slate-900">{name}</span>
          <span className="block text-sm text-slate-600">{about}</span>
        </span>
        {counts ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {stat(counts.checked, 'checked', false)}
            {stat(counts.toCheck, 'to check', true)}
            {stat(counts.cantRead, 'can’t be read', true)}
            {pages ? (
              stat(counts.didntLoad, 'didn’t load today', true)
            ) : (
              // Held open, so its counts line up with the rows above.
              <span aria-hidden="true" className="invisible">
                {stat(0, 'didn’t load today', false)}
              </span>
            )}
          </span>
        ) : counts === null ? (
          <span className="text-sm text-slate-500">Couldn&rsquo;t load its counts.</span>
        ) : (
          <span className="text-sm text-slate-500" data-testid="job-loading">Loading…</span>
        )}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0 text-slate-400">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </Link>
    </li>
  )
}


const BUTTON = 'rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

function NewsletterLink({ listings, busy, onLink, onIgnore }: { listings: Listing[]; busy: boolean; onLink: (id: string) => void; onIgnore: () => void }) {
  const [name, setName] = useState('')
  const listing = listings.find((l) => l.name === name.trim())
  return (
    <div className="mt-2 space-y-2" data-testid="newsletter-unlinked">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          list="watch-listings"
          aria-label="The shul it’s from"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The shul it’s from"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button type="button" disabled={busy || !listing} onClick={() => listing && onLink(listing.id)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Link
        </button>
        <button type="button" disabled={busy} onClick={onIgnore} className={BUTTON}>
          Not a shul
        </button>
      </div>
    </div>
  )
}

/** What the tab last showed, per community, so coming back to it (from a
 *  job's page) shows that at once while it's read again (the user, Oct 22). */
const lastSeen = new Map<string, Loaded>()

/** For tests: start from nothing. */
export function forgetWatchesTab() {
  lastSeen.clear()
  forgetWatchJobs()
}

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  // The listings, for linking a newsletter sender to its shul.
  const [data, setData] = useState<Loaded | null>(() => lastSeen.get(community) ?? null)
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` }
    try {
      setData(await fetchJson<Loaded>(withCommunity('/api/admin/watches', community), { headers }, 'Failed to load the watches.'))
    } catch {
      // Only the sender's Link needs them; it waits.
    }
  }, [token, community])

  useEffect(() => {
    if (data) lastSeen.set(community, data)
  }, [community, data])

  useLoadOnMount(load)

  async function actOn(watchId: string, action: Action, resourceId?: string) {
    setSaveError(null)
    setBusy(watchId)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: watchId, ...(resourceId ? { resourceId } : {}) }) },
        'Could not do that.',
      )
      await reload()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  const listings = data?.listings ?? []
  const base = adminBase(community)
  // As the Hospitals page counts them: a finding waiting there is to check.
  const hospitalStates = jobs.hospitals?.map((h) => ({ ...h, waiting: h.findings?.length }))
  const hospitalsNothing = hospitalStates ? hospitalCounts(hospitalStates, now).nothing : 0

  return (
    <div className="space-y-4">
      <WatchKinds jobs={jobs} base={base} now={now} />
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <NightlyRuns
        runs={jobs.runs}
        base={base}
        linkSender={(id) => <NewsletterLink listings={listings} busy={busy !== null} onLink={(shul) => void actOn(id, 'link', shul)} onIgnore={() => void actOn(id, 'ignore')} />}
      />
      {/* Each job's own page, until the pages by kind of place hold all
          they do (pieces 2 to 4). */}
      <h2 className="pt-2 text-sm font-semibold text-slate-700">Job pages</h2>
      <section className="rounded-lg border border-slate-200 bg-white" aria-label="Jobs">
        <ul className="divide-y divide-slate-100">
          <JobRow
            href={`${base}/watches/dishes`}
            name="Dishes"
            about={jobs.dishes ? `${jobs.dishes.length} food places, from their menus` : 'Food places, from their menus'}
            counts={jobs.dishes && dishCounts(jobs.dishes, now)}
          />
          <JobRow
            href={`${base}/watches/hospitals`}
            name="Hospitals"
            about={
              jobs.hospitals
                ? `${jobs.hospitals.length} hospital${jobs.hospitals.length === 1 ? '' : 's'}, from Refuah${hospitalsNothing ? ` · ${hospitalsNothing} with nothing there yet` : ''}`
                : 'Hospitals, from Refuah'
            }
            counts={hospitalStates ? hospitalCounts(hospitalStates, now) : jobs.hospitals === undefined ? undefined : null}
          />
          {jobs.hours && jobs.hours.places.length > 0 && (
            <JobRow
              href={`${base}/watches/hours`}
              name={jobs.hours.name}
              about={`${jobs.hours.places.length} place${jobs.hours.places.length === 1 ? '' : 's'}, from their websites`}
              counts={hoursCounts(jobs.hours.places.map((p) => ({ pages: p.pages.map((x) => x.watch), off: p.off, waiting: p.findings?.length, decidedAt: p.decided?.at, newsletters: p.newsletters })), now)}
            />
          )}
          {jobs.times && jobs.times.places.length > 0 && (
            <JobRow
              href={`${base}/watches/times`}
              name={jobs.times.name}
              about={`${jobs.times.places.length} shul${jobs.times.places.length === 1 ? '' : 's'}, from their websites`}
              counts={hoursCounts(jobs.times.places.map((p) => ({ pages: p.pages.map((x) => x.watch), off: p.off, waiting: p.findings?.length, decidedAt: p.decided?.at, newsletters: p.newsletters })), now)}
            />
          )}
          <JobRow
            href={`${base}/watches/eruv`}
            name="Eruv status"
            about={
              jobs.eruvim
                ? `${jobs.eruvim.eruvim.length} eruv${jobs.eruvim.eruvim.length === 1 ? '' : 'im'}. Status goes live on its own; its website’s hotline and email alerts wait here`
                : 'Eruvim. Status goes live on its own; its website’s hotline and email alerts wait here'
            }
            counts={jobs.eruvim && eruvJobCounts(jobs.eruvim, new Date(now))}
          />
          <JobRow
            href={`${base}/watches/kosher`}
            name="Kosher certification"
            about={jobs.kosher ? `${jobs.kosher.places.length} food places, from Keystone-K’s and Mekor Habracha’s lists` : 'Food places, from Keystone-K’s and Mekor Habracha’s lists'}
            counts={jobs.kosher && jobs.kosher.counts}
          />
          <JobRow href={`${base}/watches/google`} name="Google" about={jobs.google ? `${jobs.google.places.length} listings, from Google Maps` : 'Listings, from Google Maps'} counts={jobs.google && jobs.google.counts} pages={false} />
        </ul>
      </section>

      <datalist id="watch-listings">
        {listings.map((l) => (
          <option key={l.id} value={l.name}>
            {l.categoryLabel}
          </option>
        ))}
      </datalist>
    </div>
  )
}
