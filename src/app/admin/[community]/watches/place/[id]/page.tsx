'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import PlacePage from '@/components/admin/PlacePage'

// One place under Watches (/philly/admin/watches/place/<id>). 'use client', so
// the id comes from useParams(), as on watches/job/[id]. ?from= is what linked
// it, To do or a job, for its Back; useSearchParams() needs its Suspense boundary.
export default function AdminWatchPlacePage() {
  return (
    <div>
      <Suspense fallback={null}>
        <Place />
      </Suspense>
    </div>
  )
}

function Place() {
  const session = useAdminSession()
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  return <PlacePage token={session.access_token} id={decodeURIComponent(params.id)} from={search.get('from')} />
}
