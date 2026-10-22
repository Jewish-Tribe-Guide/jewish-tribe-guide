'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import HoursJob from '@/components/admin/HoursJob'

export default function AdminHoursPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <HoursJob token={session.access_token} />
    </div>
  )
}
