'use client'

import { useState } from 'react'
import { fetchJson } from '@/lib/fetchJson'
import { withCommunity } from '@/lib/useCommunityData'
import { useCommunitySlug } from '@/lib/communityContext'
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
// was here (the user, Oct 25); a kosher list is stopped or read again
// there, and Newsletters opens its own page (NewslettersPage.tsx). The job pages
// that were under it went on Oct 25, once the kinds' pages held all they
// did. Pages are added from a place's own box (Add a source).

type Action = 'pause' | 'resume'

/** For tests: start from nothing. */
export function forgetWatchesTab() {
  forgetWatchJobs()
}

export default function WatchesManager({ token }: { token: string }) {
  const community = useCommunitySlug()
  const { jobs, reload } = useWatchJobsAndReload(token)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Read once per render pass for every row alike; the tab is reloaded to refresh.
  const [now] = useState(() => Date.now())

  async function actOn(watchId: string, action: Action) {
    setSaveError(null)
    try {
      await fetchJson(
        withCommunity('/api/admin/watches', community),
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: watchId }) },
        'Could not do that.',
      )
      await reload()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const base = adminBase(community)

  return (
    <div className="space-y-4">
      <WatchKinds jobs={jobs} base={base} now={now} />
      {saveError && <p className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{saveError}</p>}
      <NightlyRuns runs={jobs.runs} base={base} onList={(id, action) => void actOn(id, action)} />
    </div>
  )
}
