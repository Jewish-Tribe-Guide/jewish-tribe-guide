'use client'

import { useState } from 'react'
import { AdminBack } from '@/components/admin/AdminUI'
import { useAdminSession } from '@/components/admin/AdminAuthGate'
import { adminBase } from '@/lib/adminNav'
import { useCommunitySlug } from '@/lib/communityContext'
import CollapsibleSection from '@/components/admin/CollapsibleSection'
import MissedSearches from '@/components/admin/MissedSearches'
import RepeatedSearches from '@/components/admin/RepeatedSearches'
import TaughtWords from '@/components/admin/TaughtWords'

// Searches that found nothing, opened from Reports like History: those asked
// more than once first, then every one, answered, dismissed or not, and the
// words the search has been taught.
export default function AdminMissedSearchesPage() {
  const session = useAdminSession()
  const community = useCommunitySlug()
  // Something dismissed or taught above: the lists under it read again.
  const [changes, setChanges] = useState(0)
  return (
    <div className="flex flex-col gap-4">
      <AdminBack back={{ label: 'Reports', href: `${adminBase(community)}/metrics` }} title="Searches nobody found" />
      <RepeatedSearches token={session.access_token} onChange={() => setChanges((n) => n + 1)} />
      <CollapsibleSection title="Every search" contentClassName="p-4">
        <MissedSearches key={changes} token={session.access_token} />
      </CollapsibleSection>
      <TaughtWords key={`words-${changes}`} token={session.access_token} />
    </div>
  )
}
