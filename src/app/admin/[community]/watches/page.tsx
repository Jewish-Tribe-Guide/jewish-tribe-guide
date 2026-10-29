'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import WatchesManager from '@/components/admin/WatchesManager'

export default function AdminWatchesPage() {
  const session = useAdminSession()
  return (
    <div>
      <WatchesManager token={session.access_token} />
    </div>
  )
}
