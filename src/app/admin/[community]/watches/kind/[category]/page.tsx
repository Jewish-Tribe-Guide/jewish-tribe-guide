'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import WatchKindPage from '@/components/admin/WatchKindPage'

// One kind of place on the Watches tab, by its category's id
// (/philly/admin/watches/kind/restaurant). 'use client', so the category
// comes from useParams(), as on /admin/[community]/history/[status].
// ?place=<id> opens it on that place (What's tracked's lines link there);
// useSearchParams() needs its Suspense boundary.
export default function AdminWatchKindPage() {
  return (
    <div>
      <Suspense fallback={null}>
        <Kind />
      </Suspense>
    </div>
  )
}

function Kind() {
  const session = useAdminSession()
  const params = useParams<{ category: string }>()
  const place = useSearchParams().get('place')
  return <WatchKindPage token={session.access_token} category={params.category} place={place} />
}
