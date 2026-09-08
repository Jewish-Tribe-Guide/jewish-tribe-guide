'use client'

import { useAdminSession } from '@/components/admin/AdminAuthGate'
import AdminNav from '@/components/admin/AdminNav'
import SubscriberManager from '@/components/admin/SubscriberManager'

export default function AdminSubscribersPage() {
  const session = useAdminSession()
  return (
    <div>
      <AdminNav />
      <SubscriberManager token={session.access_token} />
    </div>
  )
}
