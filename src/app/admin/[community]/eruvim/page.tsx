'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import EruvimManager from '@/components/admin/EruvimManager'

export default function AdminEruvimPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <EruvimManager token={session.access_token} />
    </div>
  )
}
