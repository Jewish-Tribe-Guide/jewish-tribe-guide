'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import EruvJob from '@/components/admin/EruvJob'

export default function AdminEruvStatusPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <EruvJob token={session.access_token} />
    </div>
  )
}
