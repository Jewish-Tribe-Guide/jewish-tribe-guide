'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import MissedSearches from '@/components/admin/MissedSearches'

export default function AdminMissedSearchesPage() {
  const session = useAdminSession()
  return (
    <div>
      <MissedSearches token={session.access_token} />
    </div>
  )
}
