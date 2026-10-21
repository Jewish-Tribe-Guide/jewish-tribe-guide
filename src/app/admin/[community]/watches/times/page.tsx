'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import HoursJob from '@/components/admin/HoursJob'

// The Watches tab's Shul times page (the user, Oct 21): the hours job's
// page, for every place with davening times.
export default function AdminShulTimesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <HoursJob token={session.access_token} job="times" />
    </div>
  )
}
