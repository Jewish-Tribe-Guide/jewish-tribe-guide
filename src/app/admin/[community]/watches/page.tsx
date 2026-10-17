'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import WatchesManager from '@/components/admin/WatchesManager'

export default function AdminWatchesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <WatchesManager token={session.access_token} />
    </div>
  )
}
