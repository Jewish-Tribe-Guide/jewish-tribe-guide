'use client'

import { useParams } from 'next/navigation'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import JobPage from '@/components/admin/JobPage'

// One job on the Watches tab, by its id (/philly/admin/watches/job/times).
// 'use client', so the id comes from useParams(), as on watches/kind/[category].
export default function AdminWatchJobPage() {
  const session = useAdminSession()
  const params = useParams<{ id: string }>()
  return (
    <div>
      <JobPage token={session.access_token} id={params.id} />
    </div>
  )
}
