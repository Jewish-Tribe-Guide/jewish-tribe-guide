'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import HospitalsJob from '@/components/admin/HospitalsJob'

export default function AdminHospitalsPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <HospitalsJob token={session.access_token} />
    </div>
  )
}
