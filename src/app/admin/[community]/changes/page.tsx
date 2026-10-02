'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import WhatChangedAdmin from '@/components/admin/WhatChangedAdmin'

export default function AdminWhatChangedPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <WhatChangedAdmin token={session.access_token} />
    </div>
  )
}
