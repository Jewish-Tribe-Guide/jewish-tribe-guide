'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import ReportsPanel from '@/components/admin/ReportsPanel'

export default function AdminReportsPage() {
  const session = useAdminSession()
  return <ReportsPanel token={session.access_token} />
}
