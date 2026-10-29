'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import MetricsPanel from '@/components/admin/MetricsPanel'

export default function AdminMetricsPage() {
  const session = useAdminSession()
  return (
    <div>
      <MetricsPanel token={session.access_token} />
    </div>
  )
}
