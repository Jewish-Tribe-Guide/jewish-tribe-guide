'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import WatchKindPage from '@/components/admin/WatchKindPage'

// One kind of place on the Watches tab, by its category's id
// (/philly/admin/watches/kind/restaurant). 'use client', so the category
// comes from useParams(), as on /admin/[community]/history/[status].
// ?place=<id> opens it on that place (Needs fixing and a job's lists link
// there); &from=todo, its Back goes to To do, where it came from;
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
  const search = useSearchParams()
  return <WatchKindPage token={session.access_token} category={params.category} place={search.get('place')} fromTodo={search.get('from') === 'todo'} />
}
