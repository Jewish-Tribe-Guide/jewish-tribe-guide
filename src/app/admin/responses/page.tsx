'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import ResponsesManager from '@/components/admin/ResponsesManager'

export default function AdminResponsesPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <ResponsesManager token={session.access_token} />
    </div>
  )
}
