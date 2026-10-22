'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import KosherJob from '@/components/admin/KosherJob'

export default function AdminKosherPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <KosherJob token={session.access_token} />
    </div>
  )
}
