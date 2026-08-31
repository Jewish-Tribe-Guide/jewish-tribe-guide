'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import ArchivedListings from '@/components/admin/ArchivedListings'

export default function AdminArchivedPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <ArchivedListings token={session.access_token} />
    </div>
  )
}
