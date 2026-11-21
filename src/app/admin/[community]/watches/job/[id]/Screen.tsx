'use client'

import { useParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import JobPage from '@/components/admin/JobPage'
import LookAgainPage from '@/components/admin/LookAgainPage'

// One job on the Watches tab, by its id (/philly/admin/watches/job/times).
// Look again has its own page: it reads no source of its own, but tries
// again what the others couldn't find (lookAgain.ts).
// 'use client', so the id comes from useParams(), as on watches/kind/[category].
export default function AdminWatchJobPage() {
  const session = useAdminSession()
  const params = useParams<{ id: string }>()
  return (
    <div>
      {params.id === 'look-again' ? <LookAgainPage token={session.access_token} /> : <JobPage token={session.access_token} id={params.id} />}
    </div>
  )
}
