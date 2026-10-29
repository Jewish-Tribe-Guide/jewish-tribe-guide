'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import ResponsesManager from '@/components/admin/ResponsesManager'

export default function AdminResponsesPage() {
  const session = useAdminSession()
  return (
    <div>
      <ResponsesManager token={session.access_token} />
    </div>
  )
}
