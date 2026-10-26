'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLoadOnMount } from '@/lib/useLoadOnMount'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
import type { Watch } from '@/lib/watches'
import type { ListingReads } from '@/lib/watchPurposes'
import { adminBase } from '@/lib/adminNav'
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
// linked there, and a kosher list stopped or read again. The job pages
// that were under it went on Oct 25, once the kinds' pages held all they
// did. Pages are added from a place's own box (Add a source).

/** `job`: the kind's page where what's read for it waits ("Synagogues");
 *  none, the moderation queue. */
type Listing = { id: string; name: string; categoryLabel: string; reads: ListingReads; job?: string | null }
type Loaded = { available: boolean; watches: Watch[]; listings: Listing[] }
type Action = 'link' | 'ignore' | 'pause' | 'resume'
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
 *  kind's page) shows that at once while it's read again (the user, Oct 22). */
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

  return (
    <div className="space-y-4">
      <WatchKinds jobs={jobs} base={base} now={now} />
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <NightlyRuns
        runs={jobs.runs}
        base={base}
        linkSender={(id) => <NewsletterLink listings={listings} busy={busy !== null} onLink={(shul) => void actOn(id, 'link', shul)} onIgnore={() => void actOn(id, 'ignore')} />}
        onList={(id, action) => void actOn(id, action)}
      />

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
