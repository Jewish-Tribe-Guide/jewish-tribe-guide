'use client'

import { AdminBack } from '@/components/admin/AdminUI'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import MissedSearches from '@/components/admin/MissedSearches'
import TaughtWords from '@/components/admin/TaughtWords'

// Every search that found nothing, answered, dismissed or not, and the words
// the search has been taught. The ones still waiting are on To do; this
// page opens from Reports, like History.
export default function AdminMissedSearchesPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Reports', href: `${adminBase(community)}/metrics` }} title="Searches nobody found" />
      <MissedSearches token={session.access_token} />
      <TaughtWords token={session.access_token} />
    </div>
  )
}
