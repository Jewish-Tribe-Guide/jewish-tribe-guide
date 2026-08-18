'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import MetricsPanel from '@/components/admin/MetricsPanel'

export default function AdminMetricsPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <MetricsPanel token={session.access_token} />
    </div>
  )
}
