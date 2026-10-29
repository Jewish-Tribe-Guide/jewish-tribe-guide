'use client'

import Link from 'next/link'
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
      <div>
        <Link href={`${adminBase(community)}/metrics`} className="inline-flex items-center min-h-11 -mt-3 text-sm font-semibold text-primary">
          ‹ Reports
        </Link>
        <h2 className="m-0 text-[26px] font-bold text-slate-900">Searches nobody found</h2>
      </div>
      <MissedSearches token={session.access_token} />
      <TaughtWords token={session.access_token} />
    </div>
  )
}
