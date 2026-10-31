'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AddWatchPage from '@/components/admin/AddWatchPage'

export default function AdminAddWatchPage() {
  const session = useAdminSession()
  return (
    <div>
      <AddWatchPage token={session.access_token} />
    </div>
  )
}
