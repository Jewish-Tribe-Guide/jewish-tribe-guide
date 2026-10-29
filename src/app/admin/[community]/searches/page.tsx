'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import MissedSearches from '@/components/admin/MissedSearches'
import TaughtWords from '@/components/admin/TaughtWords'

// Every search that found nothing, answered, dismissed or not, and the words
// the search has been taught. The ones still waiting are on To do.
export default function AdminMissedSearchesPage() {
  const session = useAdminSession()
  return (
    <div className="flex flex-col gap-4">
      <MissedSearches token={session.access_token} />
      <TaughtWords token={session.access_token} />
    </div>
  )
}
