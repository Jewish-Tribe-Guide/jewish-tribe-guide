'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import MissedSearches from '@/components/admin/MissedSearches'

export default function AdminMissedSearchesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <MissedSearches token={session.access_token} />
    </div>
  )
}
