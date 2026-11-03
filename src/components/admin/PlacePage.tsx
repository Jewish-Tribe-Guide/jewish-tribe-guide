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
import { eruvPlace } from '@/lib/adminPlaces'
import EruvListing from './EruvListing'
import { openedPlace } from './openedPlaceBoxes'
import PlaceListing from './PlaceListing'
import { JobsNotLoaded, kindsOf } from './WatchKinds'
import { useWatchJobsAndReload } from './useWatchJobs'

// One place under Watches (Oct 31; boards Rule4, Waiting4, NotRead4, Nov 1): a
// change waiting or a read that failed opens the screen To do has for it;
// anything else opens its listing, the same as in Places. Back goes to the
// screen that linked it; once there's nothing left to do for it, so does the
// page.

export default function PlacePage({ token, id, from }: { token: string; id: string; from?: string | null }) {
  const community = useCommunitySlug()
  const base = adminBase(community)
  const router = useRouter()
  const { jobs, reload } = useWatchJobsAndReload(token)
  // Read once, for every row alike; the page is reloaded to refresh.
  const [now] = useState(() => Date.now())
  const all = kindsOf(jobs, base, now)
  const place = all?.kinds.flatMap((k) => k.places).find((p) => p.id === id)
  const back = placeBack(from, base, (job) => (job === 'look-again' ? 'Look again' : NIGHT_KINDS.find((k) => k.id === job)?.name))
  const state = place?.state

  // What it was when something was done here: jobs seen on an earlier visit
  // catching up aren't a decision.
  const before = useRef<WatchState | null>(null)
  useEffect(() => {
    if (before.current && before.current !== 'up_to_date' && state !== before.current && (!state || state === 'up_to_date')) router.push(back.href)
  }, [state, back.href, router])

  const head = <AdminBack back={back} title={place?.name ?? ''} />
  // Something to do for it, as it was first seen: a read that fails from the
  // listing stays on the listing, which says so.
  const toDo = !!place && (state === 'waiting' || (state === 'not_checked' && openedPlace(id, jobs, now).problems.length > 0))
  const eruv = jobs.eruvim?.eruvim.find((e) => e.id === id)
  const eruvCategory = jobs.categories?.find((c) => c.kind === 'eruv')
  const listed = eruv ? eruvPlace(eruv, eruvCategory?.id ?? 'eruv') : jobs.places?.find((p) => p.id === id)
  const settled = !!all?.settled && jobs.places !== undefined
  const [onListing, setOnListing] = useState(false)
  if (settled && !toDo && listed && !onListing) setOnListing(true)

  if (jobs.categories === null || jobs.google === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn&rsquo;t load this place.</p></div>
  if (!settled) return <div className="space-y-4">{head}<p className="text-sm text-muted">Loading…</p></div>
  if (listed && eruv && (onListing || !toDo)) {
    return <EruvListing key={eruv.id} place={listed} eruv={eruv} category={eruvCategory} token={token} jobs={jobs} reload={reload} now={now} backLabel={back.label} onClose={() => router.push(back.href)} onSaved={() => router.push(back.href)} />
  }
  if (listed && (onListing || !toDo)) {
    return (
      <PlaceListing
        key={listed.id}
        place={listed}
        category={jobs.categories?.find((c) => c.id === listed.category)}
        token={token}
        jobs={jobs}
        reload={reload}
        now={now}
        backLabel={back.label}
        onClose={() => router.push(back.href)}
        onSaved={() => router.push(back.href)}
      />
    )
  }
  if (!toDo && jobs.places === null) return <div className="space-y-4">{head}<p className="text-sm text-red-700">Couldn&rsquo;t load this place.</p></div>
  if (!place || !toDo) return <div className="space-y-4">{head}<p className="text-sm text-slate-600">Nothing is watching this place now.</p></div>

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
