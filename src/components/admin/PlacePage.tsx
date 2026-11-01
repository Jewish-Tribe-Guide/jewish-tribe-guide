'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCommunitySlug } from '@/lib/communityContext'
import { adminBase } from '@/lib/adminNav'
import { NIGHT_KINDS } from '@/lib/nightKinds'
import { placeBack } from '@/lib/placeLink'
import type { WatchState } from '@/lib/watchPlaces'
import { AdminBack } from './AdminUI'
import OpenedPlace from './OpenedPlace'
import { JobsNotLoaded, kindsOf } from './WatchKinds'
import { useWatchJobsAndReload } from './useWatchJobs'

// One place under Watches, on a screen of its own (Oct 31): what a job read of
// it, what's waiting, what isn't checked, with their buttons. It replaces the
// page of a whole kind with its three tabs: what waits is on To do, what wasn't
// read is on its job, and every place is on Places. Back goes to the screen
// that linked it; once there's nothing left to do for it, so does the page.

export default function PlacePage({ token, id, from }: { token: string; id: string; from?: string | null }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const router = useRouter()
  const { jobs, reload } = useWatchJobsAndReload(token)
  // Read once, for every row alike; the page is reloaded to refresh.
  const [now] = useState(() => Date.now())
  const all = kindsOf(jobs, base, now)
  const place = all?.kinds.flatMap((k) => k.places).find((p) => p.id === id)
  const back = placeBack(from, base, (job) => NIGHT_KINDS.find((k) => k.id === job)?.name)
  const state = place?.state

  // What it was when something was done here: jobs seen on an earlier visit
  // catching up aren't a decision.
  const before = useRef<WatchState | null>(null)
  useEffect(() => {
    if (before.current && before.current !== 'up_to_date' && state !== before.current && (!state || state === 'up_to_date')) router.push(back.href)
  }, [state, back.href, router])

  const head = <AdminBack back={back} title={place?.name ?? ''} />
  if (jobs.categories === null || jobs.google === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn&rsquo;t load this place.</p></div>
  if (!all || !all.settled) return <div className="space-y-4">{head}<p className="text-sm text-muted">Loading…</p></div>
  if (!place) return <div className="space-y-4">{head}<p className="text-sm text-slate-600">Nothing is watching this place now.</p></div>

  return (
    <div className="space-y-3.5">
      {head}
      <JobsNotLoaded jobs={jobs} />
      <OpenedPlace
        key={place.id}
        place={place}
        jobs={jobs}
        token={token}
        community={community}
        now={now}
        onChanged={async () => {
          before.current = place.state
          await reload()
        }}
      />
    </div>
  )
}
