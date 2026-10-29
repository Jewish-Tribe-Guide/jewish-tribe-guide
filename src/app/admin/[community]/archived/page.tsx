'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import ArchivedListings from '@/components/admin/ArchivedListings'

export default function AdminArchivedPage() {
  const session = useAdminSession()
  return (
    <div>
      <ArchivedListings token={session.access_token} />
    </div>
  )
}
