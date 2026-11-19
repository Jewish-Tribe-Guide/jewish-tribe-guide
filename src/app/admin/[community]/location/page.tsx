'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import DefaultLocationEditor from '@/components/admin/DefaultLocationEditor'

export default function AdminDefaultLocationPage() {
  const session = useAdminSession()
  return <DefaultLocationEditor token={session.access_token} />
}
