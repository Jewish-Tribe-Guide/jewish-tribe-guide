'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import PagesEditor from '@/components/admin/PagesEditor'

export default function AdminPagesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <PagesEditor token={session.access_token} />
    </div>
  )
}
