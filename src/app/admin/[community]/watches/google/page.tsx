'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import GoogleJob from '@/components/admin/GoogleJob'

export default function AdminGooglePage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <GoogleJob token={session.access_token} />
    </div>
  )
}
